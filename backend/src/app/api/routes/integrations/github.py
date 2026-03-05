import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
import jwt as pyjwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.api.deps import auth_protect_route
from app.config import settings
from app.db.supabase_client import get_supabase
from app.integrations.crypto import encrypt_token
from app.workers.queue import queue
from app.workers.tasks import deprovision_skill, gather_github_context, provision_skill

router = APIRouter(prefix="/github")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_app_jwt() -> str:
    """Sign a short-lived JWT with the GitHub App private key.

    Used to authenticate as the GitHub App itself (not a user) when calling
    the GitHub API — e.g. to create installation access tokens.
    """
    now = int(time.time())
    private_key = settings.github_private_key.replace("\\n", "\n")
    payload = {
        "iat": now - 60,   # 60s in the past to account for clock drift
        "exp": now + 600,  # valid for 10 minutes
        "iss": settings.github_app_id,
    }
    return pyjwt.encode(payload, private_key, algorithm="RS256")


async def _create_installation_token(installation_id: int) -> dict:
    """Exchange a GitHub App JWT for a short-lived installation access token.

    Returns a dict with 'token' (ghs_ prefixed) and 'expires_at' (ISO 8601).
    """
    app_jwt = _generate_app_jwt()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.github.com/app/installations/{installation_id}/access_tokens",
            headers={
                "Authorization": f"Bearer {app_jwt}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
    return resp.json()


async def _exchange_user_code(code: str, redirect_uri: str) -> dict:
    """Exchange an OAuth code for a user access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
    return resp.json()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/connect")
async def github_connect(request: Request, user_id: str):
    """Redirect the user to the GitHub App installation page.

    The state parameter carries user_id through the installation and OAuth
    flows so we can associate the installation with the correct user on callback.
    """
    params = urlencode({"state": user_id})
    return RedirectResponse(
        f"https://github.com/apps/{settings.github_app_slug}/installations/new?{params}"
    )


@router.get("/callback", name="github_callback")
async def github_callback(
    request: Request,
    installation_id: int | None = None,
    code: str | None = None,
    state: str | None = None,
    setup_action: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
):
    """Handle the GitHub App callback after installation + optional user OAuth.

    GitHub sends this request with:
      - installation_id: always present after installation
      - code: present when "Request user authorization during installation" is enabled
      - state: the user_id we passed to the installation URL
      - setup_action: 'install' or 'update'
    """
    if error:
        raise HTTPException(status_code=400, detail=f"GitHub error: {error_description or error}")

    user_id = state
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing state parameter. Please try connecting again.")
    if not installation_id:
        raise HTTPException(status_code=400, detail="Missing installation_id from GitHub.")

    redirect_uri = settings.github_redirect_uri or str(request.url_for("github_callback"))

    # --- Installation (bot) token ---
    try:
        installation_data = await _create_installation_token(installation_id)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Failed to create GitHub installation token: {e}")

    bot_token = installation_data["token"]
    bot_token_expires_at = installation_data["expires_at"]

    # --- User access token (present when user authorized the app via OAuth) ---
    user_token: str | None = None
    user_token_expires_at: str | None = None
    user_refresh_token: str | None = None
    account_login = "GitHub Account"
    account_type: str | None = None

    if code:
        token_data = await _exchange_user_code(code, redirect_uri)
        if "error" in token_data:
            print(f"[github] user OAuth failed (continuing with bot token only): {token_data}")
        else:
            user_token = token_data.get("access_token")
            user_refresh_token = token_data.get("refresh_token")
            if token_data.get("expires_in"):
                ts = datetime.now(timezone.utc).timestamp() + token_data["expires_in"]
                user_token_expires_at = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()

    # Prefer user token for user info; fall back to app JWT with installation context
    auth_token_for_user_fetch = user_token or bot_token
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {auth_token_for_user_fetch}",
                    "Accept": "application/vnd.github+json",
                },
            )
        github_user = resp.json()
        account_login = github_user.get("login", account_login)
        account_type = github_user.get("type")  # 'User' or 'Organization'
    except Exception as e:
        print(f"[github] could not fetch user info (using default label): {e}")

    supabase = get_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    supabase.table("github_installations").upsert(
        {
            "user_id": user_id,
            "installation_id": installation_id,
            "account_login": account_login,
            "account_type": account_type,
            "bot_token": encrypt_token(bot_token),
            "bot_token_expires_at": bot_token_expires_at,
            "user_token": encrypt_token(user_token) if user_token else None,
            "user_token_expires_at": user_token_expires_at,
            "user_refresh_token": encrypt_token(user_refresh_token) if user_refresh_token else None,
            "updated_at": now_iso,
        },
        on_conflict="installation_id",
    ).execute()

    # access_token = bot token (refreshed automatically via JWT every hour)
    # refresh_token = installation_id (used by manager.py to regenerate bot token)
    supabase.table("integrations").upsert(
        {
            "user_id": user_id,
            "provider": "github",
            "account_label": account_login,
            "access_token": encrypt_token(bot_token),
            "refresh_token": encrypt_token(str(installation_id)),
            "expires_at": bot_token_expires_at,
            "scopes": [],
            "updated_at": now_iso,
        }
    ).execute()

    queue.enqueue(gather_github_context, user_id)
    queue.enqueue(provision_skill, user_id, "github")

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/github/success")


@router.delete("")
async def github_disconnect(user_id: str = Depends(auth_protect_route)):
    """Uninstall the GitHub App and remove all stored tokens."""
    supabase = get_supabase()

    row = (
        supabase.table("github_installations")
        .select("installation_id")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )

    if row and row.data:
        installation_id = row.data["installation_id"]
        try:
            app_jwt = _generate_app_jwt()
            async with httpx.AsyncClient() as client:
                await client.delete(
                    f"https://api.github.com/app/installations/{installation_id}",
                    headers={
                        "Authorization": f"Bearer {app_jwt}",
                        "Accept": "application/vnd.github+json",
                    },
                )
        except Exception as e:
            print(f"[github] installation deletion failed (continuing disconnect): {e}")

    supabase.table("github_installations").delete().eq("user_id", user_id).execute()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "github").execute()
    queue.enqueue(deprovision_skill, user_id, "github")
    return {"status": "disconnected"}
