from datetime import datetime, timezone

import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.api.deps import auth_protect_route
from app.config import settings
from app.db.supabase_client import get_supabase
from app.integrations.crypto import decrypt_token, encrypt_token
from app.workers.queue import queue
from app.workers.tasks import deprovision_skill, gather_google_drive_context, provision_skill

router = APIRouter(prefix="/google")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
    access_token_url="https://oauth2.googleapis.com/token",
    client_kwargs={"scope": " ".join([
        "https://www.googleapis.com/auth/drive.readonly",      # read all Drive files + metadata
        "https://www.googleapis.com/auth/documents",           # read + edit Google Docs
        "https://www.googleapis.com/auth/spreadsheets",        # read + edit Google Sheets
        "https://www.googleapis.com/auth/presentations",       # read + edit Google Slides
    ])},
)


@router.get("/connect")
async def google_connect(request: Request, user_id: str):
    request.session["connecting_user_id"] = user_id
    redirect_uri = f"{settings.api_base_url}/integrations/google/callback"
    return await oauth.google.authorize_redirect(
        request,
        redirect_uri,
        access_type="offline",
        prompt="consent",
    )


@router.get("/callback", name="google_callback")
async def google_callback(request: Request):
    user_id = request.session.pop("connecting_user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Session expired or user not found. Please try connecting again.",
        )

    token = await oauth.google.authorize_access_token(request)
    supabase = get_supabase()

    account_label = token.get("userinfo", {}).get("email", "Google Account")

    expires_at = None
    if "expires_in" in token:
        expires_timestamp = datetime.now(timezone.utc).timestamp() + token["expires_in"]
        expires_at = datetime.fromtimestamp(expires_timestamp, tz=timezone.utc).isoformat()

    supabase.table("integrations").upsert({
        "user_id": user_id,
        "provider": "google",
        "account_label": account_label,
        "access_token": encrypt_token(token["access_token"]),
        "refresh_token": encrypt_token(token.get("refresh_token", "")),
        "expires_at": expires_at,
        "scopes": token.get("scope", "").split() if isinstance(token.get("scope"), str) else [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # runs syncrhonously as long as there is one worker, gather_*_context task depends on the skill
    queue.enqueue(provision_skill, user_id, "google")
    queue.enqueue(gather_google_drive_context, user_id)

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/google-drive/success")


@router.post("/sync-agent")
async def sync_google_drive(user_id: str = Depends(auth_protect_route)):
    """Queue up a task to gather context from Google Drive."""
    try:
        job = queue.enqueue(gather_google_drive_context, user_id)
        print(f"Google Drive job enqueued successfully: {job.id if job else 'NO JOB RETURNED'}")
        return {"status": "success", "message": "Google Drive context gathering queued", "job_id": job.id if job else None}
    except Exception as e:
        print(f"Error queueing Google Drive context gathering: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"Failed to queue Google Drive context gathering: {e}",
        )


@router.delete("")
async def google_disconnect(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    row = supabase.table("integrations").select("access_token").eq("user_id", user_id).eq("provider", "google").maybe_single().execute()
    if row and row.data:
        try:
            token = decrypt_token(row.data["access_token"])
            async with httpx.AsyncClient() as client:
                await client.post(f"https://oauth2.googleapis.com/revoke?token={token}")
        except Exception as e:
            print(f"[google] token revocation failed (continuing disconnect): {e}")
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "google").execute()
    queue.enqueue(deprovision_skill, user_id, "google")
    return {"status": "disconnected"}
