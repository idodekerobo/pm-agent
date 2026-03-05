from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Any, Literal

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase

router = APIRouter()


class ClientErrorRequest(BaseModel):
    platform: Literal["web_app"] = "web_app"
    message: str
    error_type: str | None = None
    context: dict[str, Any] | None = None


@router.post("/errors", status_code=204)
async def report_client_error(
    body: ClientErrorRequest,
    user_id: str = Depends(auth_protect_route),
):
    """
    Accepts error reports from the web app and persists them to the errors table.
    Returns 204 No Content on success — never raises so a logging failure doesn't
    surface as an error to the user.
    """
    try:
        supabase = get_supabase()
        supabase.table("errors").insert({
            "user_id": user_id,
            "platform": "web_app",
            "error_type": body.error_type or "ClientError",
            "message": body.message,
            "context": body.context or {},
        }).execute()
    except Exception:
        pass
