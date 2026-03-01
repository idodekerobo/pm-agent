"""Slack OAuth install flow, event webhook, and web settings routes."""

import json
from datetime import datetime, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from slack_sdk.signature import SignatureVerifier

from app.api.deps import auth_protect_route
from app.config import settings
from app.db.supabase_client import get_supabase
from app.integrations.crypto import encrypt_token
from app.messaging.slack.installation_store import (
    get_channels,
    get_installation_by_team_id,
    get_installation_by_user_id,
    save_installation,
)
from app.schemas.slack import SlackChannel, SlackChannelUpdate
from app.workers.queue import queue
from app.workers.tasks import handle_slack_message

router = APIRouter()

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

# Module-level verifier — instantiated once, reused across requests.
# Lazily initialised so the module can still be imported when the env var is
# missing (e.g. in test environments that don't set Slack credentials).
_verifier: SignatureVerifier | None = None


def _get_verifier() -> SignatureVerifier:
    global _verifier
    if _verifier is None:
        _verifier = SignatureVerifier(signing_secret=settings.slack_signing_secret)
    return _verifier


# ---------------------------------------------------------------------------
# OAuth install flow
# ---------------------------------------------------------------------------

def _get_redirect_uri(request: Request) -> str:
    """Return the OAuth redirect URI.

    Uses SLACK_REDIRECT_URI from config when set (required for local dev via ngrok,
    and for production where the canonical URL differs from the request origin).
    Falls back to url_for only when the config value is empty.
    """
    if settings.slack_redirect_uri:
        return settings.slack_redirect_uri
    return str(request.url_for("slack_callback"))


@router.get("/integrations/slack/connect")
async def slack_connect(request: Request, user_id: str):
    """Redirect the user to Slack's OAuth v2 consent page.

    Passes user_id as the OAuth state parameter so the callback can identify
    the PM Agent user without relying on a session cookie. This is required
    when connect and callback land on different domains (e.g. localhost vs ngrok).
    """
    params = urlencode({
        "client_id": settings.slack_client_id,
        "scope": " ".join(_SLACK_BOT_SCOPES),
        "redirect_uri": _get_redirect_uri(request),
        "state": user_id,
    })
    return RedirectResponse(f"https://slack.com/oauth/v2/authorize?{params}")


@router.get("/integrations/slack/callback", name="slack_callback")
async def slack_callback(
    request: Request,
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
            data={"code": code, "redirect_uri": _get_redirect_uri(request)},
            # Slack requires client credentials as HTTP Basic Auth
            auth=(settings.slack_client_id, settings.slack_client_secret),
        )

    token_data = response.json()
    if not token_data.get("ok"):
        raise HTTPException(
            status_code=400,
            detail=f"Slack token exchange failed: {token_data.get('error')}",
        )

    save_installation(user_id, token_data)

    supabase = get_supabase()
    supabase.table("integrations").upsert({
        "user_id": user_id,
        "provider": "slack",
        "account_label": token_data.get("team", {}).get("name", "Slack Workspace"),
        "access_token": encrypt_token(token_data["access_token"]),
        "scopes": token_data.get("scope", "").split(","),
        "expires_at": datetime(2099, 12, 31, tzinfo=timezone.utc).isoformat(), # slack tokens don't expire and have no refresh token
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/slack/success")


# ---------------------------------------------------------------------------
# Webhook receiver
# ---------------------------------------------------------------------------

@router.post("/slack/events")
async def slack_events(request: Request):
    """Receive all Slack Event Subscription payloads.

    Security: every request is verified with the Slack signing secret (HMAC-SHA256)
    before any processing occurs. slack_sdk's SignatureVerifier also enforces a
    5-minute replay-attack window.

    The endpoint returns HTTP 200 immediately and offloads the actual work to an
    RQ background task — Slack requires a response within 3 seconds.
    """
    print("Hitting /slack/events endpoint to process messages")
    body = await request.body()
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")

    if not _get_verifier().is_valid(
        body=body.decode("utf-8"),
        timestamp=timestamp,
        signature=signature,
    ):
        raise HTTPException(status_code=403, detail="Invalid Slack signature")

    payload = json.loads(body)

    # One-time URL verification challenge (during Slack app setup)
    if payload.get("type") == "url_verification":
        return JSONResponse({"challenge": payload["challenge"]})

    team_id = payload.get("team_id")
    installation = get_installation_by_team_id(team_id)
    if not installation:
        # Unknown workspace — installation may have been revoked; silently ack
        return JSONResponse({"ok": True})

    queue.enqueue(handle_slack_message, payload, str(installation.id))

    return JSONResponse({"ok": True})


# ---------------------------------------------------------------------------
# Web settings — channel management
# ---------------------------------------------------------------------------


@router.get("/integrations/slack/channels")
async def list_slack_channels(user_id: str = Depends(auth_protect_route)) -> list[SlackChannel]:
    """Return all channels the bot has been added to, with their is_enabled status."""
    installation = get_installation_by_user_id(user_id)
    if not installation:
        return []
    return get_channels(str(installation.id))


@router.patch("/integrations/slack/channels/{channel_id}")
async def toggle_slack_channel(
    channel_id: str,
    body: SlackChannelUpdate,
    user_id: str = Depends(auth_protect_route),
) -> SlackChannel:
    """Enable or disable the agent posting in a specific channel."""
    installation = get_installation_by_user_id(user_id)
    if not installation:
        raise HTTPException(status_code=404, detail="No Slack installation found")

    supabase = get_supabase()
    result = (
        supabase.table("slack_channels")
        .update({"is_enabled": body.is_enabled})
        .eq("installation_id", str(installation.id))
        .eq("slack_channel_id", channel_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Channel not found")
    return SlackChannel.model_validate(result.data[0])


@router.delete("/integrations/slack")
async def slack_disconnect(user_id: str = Depends(auth_protect_route)):
    """Remove the Slack installation and all associated channels (CASCADE)."""
    supabase = get_supabase()
    supabase.table("slack_installations").delete().eq("user_id", user_id).execute()
    return {"status": "disconnected"}
