from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import auth_protect_route
from app.config import settings
from app.db.supabase_client import get_supabase

router = APIRouter()


class FeedbackRequest(BaseModel):
    description: str


@router.post("/feedback", status_code=204)
async def submit_feedback(
    body: FeedbackRequest,
    user_id: str = Depends(auth_protect_route),
):
    if not body.description.strip():
        raise HTTPException(status_code=422, detail="description is required")
    supabase = get_supabase()
    supabase.table("user_feedback").insert({
        "user_id": user_id,
        "description": body.description.strip(),
        "environment": settings.app_environment,
    }).execute()
