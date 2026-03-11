from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase
from app.integrations.crypto import encrypt_token

CLAUDE_CODE_TOKEN_TTL = timedelta(days=365)

router = APIRouter(prefix="/claude-code")


class ClaudeCodeConnectRequest(BaseModel):
    token: str


@router.post("/connect")
async def claude_code_connect(
    body: ClaudeCodeConnectRequest,
    user_id: str = Depends(auth_protect_route),
):
    token = body.token.strip()
    if not token:
        raise HTTPException(status_code=422, detail="Token is required.")

    supabase = get_supabase()

    # Delete any existing row first to guarantee a clean upsert regardless of whether a unique constraint exists
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "claude-code").execute()

    supabase.table("integrations").insert({
        "user_id": user_id,
        "provider": "claude-code",
        "account_label": "Claude Code Enabled",
        "access_token": encrypt_token(token),
        "scopes": [],
        "expires_at": (datetime.now(timezone.utc) + CLAUDE_CODE_TOKEN_TTL).isoformat(),
    }).execute()

    return {"status": "connected"}


@router.delete("")
async def claude_code_disconnect(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "claude-code").execute()
    return {"status": "disconnected"}
