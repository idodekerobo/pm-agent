from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from app.api.deps import auth_protect_route
from app.config import settings
from app.db.supabase_client import get_supabase
from app.integrations.crypto import encrypt_token
from app.workers.queue import queue
from app.workers.tasks import deprovision_skill, gather_notion_context, provision_skill

router = APIRouter(prefix="/notion")


@router.get("/connect")
async def notion_connect(user_id: str):
    redirect_uri = f"{settings.api_base_url}/integrations/notion/callback"
    params = urlencode({
        "client_id": settings.notion_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "owner": "user",
        "state": user_id,
    })
    return RedirectResponse(f"https://api.notion.com/v1/oauth/authorize?{params}")


@router.get("/callback", name="notion_callback")
async def notion_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    user_id = state
    if not user_id:
        raise HTTPException(status_code=400, detail="Session expired or user not found. Please try connecting again.")
    if error:
        raise HTTPException(status_code=400, detail=f"Notion OAuth error: {error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code from Notion.")

    redirect_uri = f"{settings.api_base_url}/integrations/notion/callback"
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.notion.com/v1/oauth/token",
            json={"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri},
            auth=(settings.notion_client_id, settings.notion_client_secret),
        )
    token = response.json()
    if "error" in token:
        raise HTTPException(status_code=400, detail=f"Notion token exchange failed: {token.get('error')}")

    supabase = get_supabase()
    supabase.table("integrations").upsert({
        "user_id": user_id,
        "provider": "notion",
        "account_label": token.get("workspace_name", "Notion Workspace"),
        "access_token": encrypt_token(token["access_token"]),
        "refresh_token": encrypt_token(token.get("refresh_token", "")),
        "expires_at": None,
        "scopes": [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    queue.enqueue(gather_notion_context, user_id)
    queue.enqueue(provision_skill, user_id, "notion")

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/notion/success")


@router.post("/sync-agent")
async def sync_notion(user_id: str = Depends(auth_protect_route)):
    """Queue up a task to gather context from Notion."""
    queue.enqueue(gather_notion_context, user_id)
    return {"status": "success", "message": "Notion context gathering queued"}


@router.delete("")
# TODO: tell the user that they have to disconnect notion manually
async def notion_disconnect(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "notion").execute()
    queue.enqueue(deprovision_skill, user_id, "notion")
    return {"status": "disconnected"}
