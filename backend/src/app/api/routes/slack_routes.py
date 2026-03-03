"""Slack event webhook and channel management routes."""

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from slack_sdk.signature import SignatureVerifier

from app.api.deps import auth_protect_route
from app.config import settings
from app.db.supabase_client import get_supabase
from app.messaging.slack.installation_store import (
    get_channels,
    get_installation_by_team_id,
    get_installation_by_user_id,
)
from app.schemas.slack import SlackChannel, SlackChannelUpdate
from app.workers.queue import queue
from app.workers.tasks import handle_slack_message

router = APIRouter()

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
