from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase
from app.schemas.user import User

router = APIRouter(prefix="/user", tags=["user"])


class ProfilePayload(BaseModel):
    full_name: str
    role: str
    company_url: str | None = None
    onboarding_scrape_observations: str | None = None
    onboarding_scrape_correction: str | None = None
    current_focus: list[str] | None = None
    daily_activities: list[str] | None = None
    imported_memories: list[dict] | None = None  # [{provider: str, content: str}]


class ImportMemoriesPayload(BaseModel):
    imported_memories: list[dict]


@router.get("/profile", response_model=User)
async def get_profile(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    row = (
        supabase.table("users")
        .select("id, email, created_at, organization_id, full_name, role, company_name, company_url, product_name, product_description, use_case, onboarding_scrape_observations, onboarding_scrape_correction, current_focus, daily_activities")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found")
    return row.data


@router.post("/profile", status_code=200)
async def save_profile(body: ProfilePayload, user_id: str = Depends(auth_protect_route)):
    return await _upsert_profile(user_id, body, enqueue_context=True)


@router.patch("/profile", status_code=200)
async def update_profile(body: ProfilePayload, user_id: str = Depends(auth_protect_route)):
    return await _upsert_profile(user_id, body, enqueue_context=False) # TODO: make this update context, but have it use a cheaper/smaller llm


async def _upsert_profile(user_id: str, body: ProfilePayload, enqueue_context: bool):
    supabase = get_supabase()

    update_data = {
        "full_name": body.full_name,
        "role": body.role,
        "company_url": body.company_url,
        "onboarding_scrape_observations": body.onboarding_scrape_observations,
        "onboarding_scrape_correction": body.onboarding_scrape_correction,
        "current_focus": body.current_focus,
        "daily_activities": body.daily_activities,
    }

    result = (
        supabase.table("users")
        .update(update_data)
        .eq("id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")

    if enqueue_context:
        from app.workers.queue import get_queue
        from app.workers.tasks import gather_onboarding_context, seed_workspace
        q = get_queue("default")
        q.enqueue(seed_workspace, user_id)
        context_profile = {**update_data, "imported_memories": body.imported_memories}
        q.enqueue(gather_onboarding_context, user_id, context_profile)

    return {"status": "ok"}


@router.post("/memories/import", status_code=200)
async def import_memories(body: ImportMemoriesPayload, user_id: str = Depends(auth_protect_route)):
    if not body.imported_memories:
        raise HTTPException(status_code=400, detail="No memories provided")
    from app.workers.queue import get_queue
    from app.workers.tasks import merge_imported_memories
    q = get_queue("default")
    q.enqueue(merge_imported_memories, user_id, body.imported_memories)
    return {"status": "ok"}
