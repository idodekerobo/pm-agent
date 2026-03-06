from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase
from app.schemas.user import User

router = APIRouter(prefix="/user", tags=["user"])


class ProfilePayload(BaseModel):
    full_name: str
    role: str
    company_name: str | None = None
    company_url: str | None = None
    product_description: str | None = None
    use_case: str | None = None


@router.get("/profile", response_model=User)
async def get_profile(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    row = (
        supabase.table("users")
        .select("id, email, created_at, organization_id, full_name, role, company_name, company_url, product_description, use_case")
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
        "company_name": body.company_name,
        "company_url": body.company_url,
        "product_description": body.product_description,
        "use_case": body.use_case,
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
        q.enqueue(gather_onboarding_context, user_id, update_data)

    return {"status": "ok"}
