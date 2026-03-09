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
from app.workers.tasks import deprovision_skill, gather_linear_context, provision_skill

router = APIRouter(prefix="/linear")

oauth = OAuth()
oauth.register(
    name="linear",
    client_id=settings.linear_client_id,
    client_secret=settings.linear_client_secret,
    authorize_url="https://linear.app/oauth/authorize",
    access_token_url="https://api.linear.app/oauth/token",
    client_kwargs={"scope": "read,write"},
)


@router.get("/connect")
async def linear_connect(request: Request, user_id: str):
    request.session["connecting_user_id"] = user_id
    redirect_uri = f"{settings.api_base_url}/integrations/linear/callback"
    return await oauth.linear.authorize_redirect(request, redirect_uri, actor="app")


# TODO: wrap in try/except
@router.get("/callback", name="linear_callback")
async def linear_callback(request: Request):
    user_id = request.session.pop("connecting_user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Session expired or user not found. Please try connecting again.",
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
    }).execute()

    # runs syncrhonously as long as there is one worker, gather_*_context task depends on the skill
    queue.enqueue(provision_skill, user_id, "linear")
    queue.enqueue(gather_linear_context, user_id)

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/linear/success")


@router.post("/sync-agent")
async def sync_linear(user_id: str = Depends(auth_protect_route)):
    """Queue up a task to gather context from Linear."""
    try:
        job = queue.enqueue(gather_linear_context, user_id)
        print(f"Linear job enqueued successfully: {job.id if job else 'NO JOB RETURNED'}")
        return {"status": "success", "message": "Linear context gathering queued", "job_id": job.id if job else None}
    except Exception as e:
        print(f"ERROR enqueueing Linear job: {e}")
        raise HTTPException(status_code=503, detail=f"Failed to enqueue: {e}")


@router.delete("")
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
