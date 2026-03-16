from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.api.deps import auth_protect_route
from app.config import settings
from app.db.supabase_client import get_supabase
from app.integrations.crypto import decrypt_token, encrypt_token
from app.messaging.slack import save_installation

router = APIRouter(prefix="/slack")

_SLACK_BOT_SCOPES = [
    "app_mentions:read",
    "channels:history",
    "channels:read",
    "chat:write",
    "groups:history",
    "groups:read",
    "im:history",
    "im:write",
    "reactions:write",
    "users:read",
]


@router.get("/connect")
async def slack_connect(user_id: str):
    """Redirect the user to Slack's OAuth v2 consent page.

    Passes user_id as the OAuth state parameter so the callback can identify
    the PM Agent user without relying on a session cookie. This is required
    when connect and callback land on different domains (e.g. localhost vs ngrok).
    """
    redirect_uri = f"{settings.api_base_url}/integrations/slack/callback"
    params = urlencode({
        "client_id": settings.slack_client_id,
        "scope": " ".join(_SLACK_BOT_SCOPES),
        "redirect_uri": redirect_uri,
        "state": user_id,
    })
    return RedirectResponse(f"https://slack.com/oauth/v2/authorize?{params}")


@router.get("/callback", name="slack_callback")
async def slack_callback(
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
):
    """Receive the OAuth code from Slack, exchange it for a bot token, and save the installation.

    Slack sends either `code` (success) or `error` (user denied / misconfigured scopes).
    user_id is recovered from the `state` parameter set during /connect.
    On success the installation is upserted in `slack_installations` and the user is
    redirected to the frontend success page.
    """
    user_id = state
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Missing state parameter. Please try connecting again.",
        )

    if error:
        raise HTTPException(status_code=400, detail=f"Slack OAuth error: {error}")

    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code from Slack.")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://slack.com/api/oauth.v2.access",
            data={"code": code, "redirect_uri": f"{settings.api_base_url}/integrations/slack/callback"},
            # Slack requires client credentials as HTTP Basic Auth
            auth=(settings.slack_client_id, settings.slack_client_secret),
        )

    token_data = response.json()
    if not token_data.get("ok"):
        raise HTTPException(
            status_code=400,
            detail=f"Slack token exchange failed: {token_data.get('error')}",
        )

    bot_name: str | None = None
    try:
        from app.messaging.slack.client import get_user_info
        bot_user_id = token_data.get("bot_user_id", "")
        bot_token = token_data.get("access_token", "")
        if bot_user_id and bot_token:
            user_info = await get_user_info(bot_token, bot_user_id)
            profile = user_info.get("profile", {})
            bot_name = profile.get("display_name") or profile.get("real_name") or None
    except Exception as e:
        print(f"[slack] could not resolve bot display name: {e}", flush=True)

    save_installation(user_id, token_data, slack_bot_name=bot_name)

    supabase = get_supabase()
    supabase.table("integrations").upsert({
        "user_id": user_id,
        "provider": "slack",
        "account_label": token_data.get("team", {}).get("name", "Slack Workspace"),
        "access_token": encrypt_token(token_data["access_token"]),
        "scopes": token_data.get("scope", "").split(","),
        "expires_at": datetime(2099, 12, 31, tzinfo=timezone.utc).isoformat(),  # slack tokens don't expire and have no refresh token
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/slack/success")


@router.delete("")
async def slack_disconnect(user_id: str = Depends(auth_protect_route)):
    """Revoke the bot token, remove the Slack installation, associated channels (CASCADE), and integrations row."""
    supabase = get_supabase()
    row = supabase.table("integrations").select("access_token").eq("user_id", user_id).eq("provider", "slack").maybe_single().execute()
    if row and row.data:
        try:
            token = decrypt_token(row.data["access_token"])
            async with httpx.AsyncClient() as client:
                await client.post("https://slack.com/api/auth.revoke", headers={"Authorization": f"Bearer {token}"})
        except Exception as e:
            print(f"[slack] token revocation failed (continuing disconnect): {e}")
    supabase.table("slack_installations").delete().eq("user_id", user_id).execute()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "slack").execute()
    return {"status": "disconnected"}


# ---------------------------------------------------------------------------
# Monitoring endpoints
# ---------------------------------------------------------------------------

class ProviderMonitoringUpdate(BaseModel):
    monitoring_enabled: bool


class ChannelMonitoringUpdate(BaseModel):
    monitoring_enabled: bool


@router.patch("/monitoring")
async def update_slack_monitoring(
    req: ProviderMonitoringUpdate,
    user_id: str = Depends(auth_protect_route),
):
    """Toggle provider-level monitoring for Slack."""
    supabase = get_supabase()
    supabase.table("integrations").update(
        {"monitoring_enabled": req.monitoring_enabled}
    ).eq("user_id", user_id).eq("provider", "slack").execute()
    return {"monitoring_enabled": req.monitoring_enabled}


@router.patch("/channels/{channel_id}/monitoring")
async def update_channel_monitoring(
    channel_id: str,
    req: ChannelMonitoringUpdate,
    user_id: str = Depends(auth_protect_route),
):
    """Toggle passive monitoring for a specific Slack channel."""
    supabase = get_supabase()
    installation = (
        supabase.table("slack_installations")
        .select("id")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not installation or not installation.data:
        raise HTTPException(status_code=404, detail="Slack installation not found.")
    supabase.table("slack_channels").update(
        {"monitoring_enabled": req.monitoring_enabled}
    ).eq("installation_id", installation.data["id"]).eq("slack_channel_id", channel_id).execute()
    return {"channel_id": channel_id, "monitoring_enabled": req.monitoring_enabled}
