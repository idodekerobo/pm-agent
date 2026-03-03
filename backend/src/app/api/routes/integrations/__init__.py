from fastapi import APIRouter, Depends

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase

from .google import router as google_router
from .linear import router as linear_router
from .notion import router as notion_router
from .slack import router as slack_router

router = APIRouter(prefix="/integrations")

router.include_router(linear_router)
router.include_router(google_router)
router.include_router(notion_router)
router.include_router(slack_router)


@router.get("/")
async def list_integrations(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    result = (
        supabase.table("integrations")
        .select("provider, account_label, scopes, created_at")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data
