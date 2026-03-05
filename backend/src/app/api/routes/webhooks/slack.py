"""Slack event webhook receiver."""

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from slack_sdk.signature import SignatureVerifier

from app.config import settings
from app.messaging.slack import get_installation_by_team_id
from app.workers.queue import get_queue
from app.workers.tasks import handle_slack_message

router = APIRouter(prefix="/slack")

# Module-level verifier — instantiated once, reused across requests.
_verifier: SignatureVerifier | None = None


def _get_verifier() -> SignatureVerifier:
    global _verifier
    if _verifier is None:
        _verifier = SignatureVerifier(signing_secret=settings.slack_signing_secret)
    return _verifier


@router.post("")
async def slack_events(request: Request):
    """Receive all Slack Event Subscription payloads.

    Security: every request is verified with the Slack signing secret (HMAC-SHA256)
    before any processing occurs. slack_sdk's SignatureVerifier also enforces a
    5-minute replay-attack window.

    The endpoint returns HTTP 200 immediately and offloads the actual work to an
    RQ background task — Slack requires a response within 3 seconds.
    """
    print("Hitting /webhook/slack endpoint to process messages")
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

    get_queue("high").enqueue(handle_slack_message, payload, str(installation.id))

    return JSONResponse({"ok": True})
