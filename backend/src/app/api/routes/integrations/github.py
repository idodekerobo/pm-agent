import time
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
import jwt as pyjwt
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.api.deps import auth_protect_route
from app.errors.logger import log_error
from app.config import settings
from app.db.supabase_client import get_supabase
from app.integrations.crypto import decrypt_token, encrypt_token
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


async def _fetch_installation_repos(bot_token: str) -> list[str]:
    """Return a list of full_names for all repos the installation has access to."""
    repos: list[str] = []
    page = 1
    async with httpx.AsyncClient() as client:
        while True:
            resp = await client.get(
                "https://api.github.com/installation/repositories",
                headers={
                    "Authorization": f"Bearer {bot_token}",
                    "Accept": "application/vnd.github+json",
                },
                params={"per_page": 100, "page": page},
            )
            if not resp.is_success:
                break
            data = resp.json()
            batch = [r["full_name"] for r in data.get("repositories", [])]
            repos.extend(batch)
            if len(batch) < 100:
                break
            page += 1
    return repos


async def _seed_repo_monitoring_config(user_id: str, bot_token: str) -> None:
    """Fetch all repos for the installation and populate repo_monitoring_config.

    Called as a background task after GitHub App install. All repos default to
    monitoring_enabled=true. Existing entries are preserved (upsert semantics on
    keys — new repos added as true, removed repos left in place until next sync).
    """
    try:
        repo_names = await _fetch_installation_repos(bot_token)
        if not repo_names:
            return
        supabase = get_supabase()
        # Build JSONB update: set each repo to true only if not already present
        existing_row = (
            supabase.table("github_installations")
            .select("repo_monitoring_config")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        existing_config: dict = {}
        if existing_row and existing_row.data:
            existing_config = existing_row.data.get("repo_monitoring_config") or {}

        updated_config = {name: existing_config.get(name, True) for name in repo_names}
        supabase.table("github_installations").update(
            {"repo_monitoring_config": updated_config}
        ).eq("user_id", user_id).execute()
    except Exception as e:
        print(f"[github] repo monitoring config seed failed: {e}")


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
async def github_connect(user_id: str):
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
    background_tasks: BackgroundTasks,
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

    redirect_uri = f"{settings.api_base_url}/integrations/github/callback"

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

    # runs syncrhonously as long as there is one worker, gather_*_context task depends on the skill
    queue.enqueue(provision_skill, user_id, "github")
    queue.enqueue(gather_github_context, user_id)

    # Seed repo_monitoring_config with all repos the installation has access to
    background_tasks.add_task(_seed_repo_monitoring_config, user_id, bot_token)

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/github/success")


@router.delete("")
async def github_disconnect(user_id: str = Depends(auth_protect_route)):
    """Revoke user OAuth token, uninstall the GitHub App, and remove all stored tokens."""
    supabase = get_supabase()

    row = (
        supabase.table("github_installations")
        .select("installation_id, user_token")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )

    if row and row.data:
        installation_id = row.data["installation_id"]

        if row.data.get("user_token"):
            try:
                user_token = decrypt_token(row.data["user_token"])
                async with httpx.AsyncClient() as client:
                    await client.delete(
                        f"https://api.github.com/applications/{settings.github_client_id}/token",
                        auth=(settings.github_client_id, settings.github_client_secret),
                        json={"access_token": user_token},
                        headers={"Accept": "application/vnd.github+json"},
                    )
            except Exception as e:
                print(f"[github] user token revocation failed (continuing disconnect): {e}")
                await log_error(user_id, "server", e, context={"route": "DELETE /integrations/github", "step": "user_token_revocation"})

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
            await log_error(user_id, "server", e, context={"route": "DELETE /integrations/github", "step": "installation_deletion", "installation_id": installation_id})

    supabase.table("github_installations").delete().eq("user_id", user_id).execute()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "github").execute()
    queue.enqueue(deprovision_skill, user_id, "github")
    return {"status": "disconnected"}


# ---------------------------------------------------------------------------
# Monitoring endpoints
# ---------------------------------------------------------------------------

class ProviderMonitoringUpdate(BaseModel):
    monitoring_enabled: bool


class RepoMonitoringUpdate(BaseModel):
    full_name: str
    monitoring_enabled: bool


@router.patch("/monitoring")
async def update_github_monitoring(
    req: ProviderMonitoringUpdate,
    user_id: str = Depends(auth_protect_route),
):
    """Toggle provider-level monitoring for GitHub."""
    supabase = get_supabase()
    supabase.table("integrations").update(
        {"monitoring_enabled": req.monitoring_enabled}
    ).eq("user_id", user_id).eq("provider", "github").execute()
    return {"monitoring_enabled": req.monitoring_enabled}


@router.patch("/repos/monitoring")
async def update_repo_monitoring(
    req: RepoMonitoringUpdate,
    user_id: str = Depends(auth_protect_route),
):
    """Toggle monitoring for a specific repo. Updates the JSONB key atomically."""
    supabase = get_supabase()
    # jsonb_set is the safe way to update a single key without overwriting others.
    # Supabase Python client doesn't expose jsonb_set directly, so we use rpc.
    supabase.rpc(
        "update_repo_monitoring_config",
        {
            "p_user_id": user_id,
            "p_full_name": req.full_name,
            "p_enabled": req.monitoring_enabled,
        },
    ).execute()
    return {"full_name": req.full_name, "monitoring_enabled": req.monitoring_enabled}


@router.post("/repos/sync")
async def sync_github_repos(
    background_tasks: BackgroundTasks,
    user_id: str = Depends(auth_protect_route),
):
    """Re-fetch the repo list from GitHub and refresh repo_monitoring_config.

    Preserves existing toggle states. Adds new repos as enabled=true.
    Removes repos that have been de-authorised from the installation.
    """
    supabase = get_supabase()
    row = (
        supabase.table("github_installations")
        .select("bot_token, bot_token_expires_at, installation_id, repo_monitoring_config")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="GitHub installation not found.")

    bot_token_encrypted = row.data["bot_token"]
    expires_at_str = row.data["bot_token_expires_at"]
    installation_id = row.data["installation_id"]
    existing_config: dict = row.data.get("repo_monitoring_config") or {}

    # Refresh bot token if expired
    expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
    if datetime.now(timezone.utc) >= expires_at:
        try:
            installation_data = await _create_installation_token(installation_id)
            bot_token = installation_data["token"]
            supabase.table("github_installations").update(
                {
                    "bot_token": encrypt_token(bot_token),
                    "bot_token_expires_at": installation_data["expires_at"],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("user_id", user_id).execute()
        except Exception as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=502, detail=f"Failed to refresh GitHub token: {e}")
    else:
        bot_token = decrypt_token(bot_token_encrypted)

    repo_names = await _fetch_installation_repos(bot_token)

    # Merge: keep existing toggle states, add new repos as true, drop removed ones
    updated_config = {name: existing_config.get(name, True) for name in repo_names}
    supabase.table("github_installations").update(
        {"repo_monitoring_config": updated_config}
    ).eq("user_id", user_id).execute()

    repos = [{"full_name": k, "monitoring_enabled": v} for k, v in updated_config.items()]
    return {"repos": repos}
