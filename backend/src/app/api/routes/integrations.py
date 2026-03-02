from datetime import datetime, timezone
from urllib.parse import urlencode
import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from app.api.deps import auth_protect_route
from app.integrations.crypto import encrypt_token, decrypt_token
from app.db.supabase_client import get_supabase
from app.config import settings
from app.workers.queue import queue
from app.workers.tasks import gather_google_drive_context, gather_linear_context, gather_notion_context, provision_skill, deprovision_skill

router = APIRouter(prefix="/integrations")

oauth = OAuth()
oauth.register(
    name="linear",
    client_id=settings.linear_client_id,
    client_secret=settings.linear_client_secret,
    authorize_url="https://linear.app/oauth/authorize",
    access_token_url="https://api.linear.app/oauth/token",
    client_kwargs={"scope": "read,write"},
)
# TODO: add auth protection to this route
@router.get("/linear/connect")
async def linear_connect(
    request: Request,
    user_id: str,
):
    print(f"request:\n{request}\n")
    request.session["connecting_user_id"] = user_id
    redirect_uri = request.url_for("linear_callback")
    return await oauth.linear.authorize_redirect(request, str(redirect_uri), actor="app")

# TODO: wrap in try/except
@router.get("/linear/callback", name="linear_callback")
async def linear_callback(request: Request):
    user_id = request.session.pop("connecting_user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=400, 
            detail="Session expired or user not found. Please try connecting again."
        )

    token = await oauth.linear.authorize_access_token(request)
    supabase = get_supabase()

    # TODO: fetch user info from linear or this app to make a structured name for the account label
    account_label = token.get("userinfo", {}).get("email", "Linear Account")

    expires_at = None
    if "expires_in" in token:
        expires_timestamp = datetime.now(timezone.utc).timestamp() + token["expires_in"]
        expires_at = datetime.fromtimestamp(expires_timestamp, tz=timezone.utc).isoformat()

    supabase.table("integrations").upsert({
        "user_id": user_id,
        "provider": "linear",
        "account_label": account_label,
        "access_token": encrypt_token(token["access_token"]),
        "refresh_token": encrypt_token(token.get("refresh_token", "")),
        "expires_at": expires_at,
        "scopes": token.get("scope", "").split() if isinstance(token.get("scope"), str) else [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    # }, on_conflict="user_id,provider").execute() # TODO: add the user_id, provider unique constriant
    }).execute()

    queue.enqueue(gather_linear_context, user_id)
    queue.enqueue(provision_skill, user_id, "linear")

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/linear/success")

@router.post("/linear/sync-agent")
async def sync_linear(user_id: str = Depends(auth_protect_route)):
    """Queue up a task to gather context from Linear."""
    try:
        job = queue.enqueue(gather_linear_context, user_id)
        print(f"Linear job enqueued successfully: {job.id if job else 'NO JOB RETURNED'}")
        return {"status": "success", "message": "Linear context gathering queued", "job_id": job.id if job else None}
    except Exception as e:
        print(f"ERROR enqueueing Linear job: {e}")
        raise HTTPException(status_code=503, detail=f"Failed to enqueue: {e}")

@router.delete("/linear")
async def linear_disconnect(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    row = supabase.table("integrations").select("access_token").eq("user_id", user_id).eq("provider", "linear").maybe_single().execute()
    if row and row.data:
        try:
            token = decrypt_token(row.data["access_token"])
            async with httpx.AsyncClient() as client:
                await client.post("https://api.linear.app/oauth/revoke", data={"access_token": token})
        except Exception as e:
            print(f"[linear] token revocation failed (continuing disconnect): {e}")
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "linear").execute()
    queue.enqueue(deprovision_skill, user_id, "linear")
    return {"status": "disconnected"}

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

@router.get("/google/connect")
async def google_connect(
    request: Request,
    user_id: str,
):
    print(f"request:\n{request}\n")
    request.session["connecting_user_id"] = user_id
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(
        request,
        str(redirect_uri),
        access_type='offline',
        prompt='consent',
    )

@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request):
    user_id = request.session.pop("connecting_user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=400, 
            detail="Session expired or user not found. Please try connecting again."
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

    queue.enqueue(gather_google_drive_context, user_id)
    queue.enqueue(provision_skill, user_id, "google")

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/google-drive/success")

@router.post("/google/sync-agent")
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
            detail=f"Failed to queue Google Drive context gathering: {e}"
        )

@router.delete("/google")
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

@router.get("/notion/connect")
async def notion_connect(request: Request, user_id: str):
    redirect_uri = settings.notion_redirect_uri or str(request.url_for("notion_callback"))
    params = urlencode({
        "client_id": settings.notion_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "owner": "user",
        "state": user_id,
    })
    return RedirectResponse(f"https://api.notion.com/v1/oauth/authorize?{params}")

@router.get("/notion/callback", name="notion_callback")
async def notion_callback(
    request: Request,
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

    redirect_uri = settings.notion_redirect_uri or str(request.url_for("notion_callback"))
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

@router.post("/notion/sync-agent")
async def sync_notion(user_id: str = Depends(auth_protect_route)):
    """Queue up a task to gather context from Notion."""
    queue.enqueue(gather_notion_context, user_id)
    return {"status": "success", "message": "Notion context gathering queued"}

@router.delete("/notion")
# TODO: tell the user that they have to disconnect notion manually
async def notion_disconnect(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "notion").execute()
    queue.enqueue(deprovision_skill, user_id, "notion")
    return {"status": "disconnected"}

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
