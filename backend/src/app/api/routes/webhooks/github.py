"""GitHub App webhook receiver."""

import hashlib
import hmac
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/github")


def _verify_signature(body: bytes, signature_header: str) -> bool:
    """Verify the X-Hub-Signature-256 header using HMAC-SHA256.

    GitHub signs every webhook payload with the webhook secret configured on
    the GitHub App. We must validate this before processing any payload.
    """
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        settings.github_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def _get_user_id_for_installation(installation_id: int) -> str | None:
    """Look up the user_id for a given GitHub App installation_id."""
    supabase = get_supabase()
    result = (
        supabase.table("github_installations")
        .select("user_id")
        .eq("installation_id", installation_id)
        .maybe_single()
        .execute()
    )
    if result and result.data:
        return result.data["user_id"]
    return None


@router.post("")
async def github_webhook(request: Request):
    """Receive all GitHub App webhook payloads.

    Security: every request is verified with HMAC-SHA256 using the webhook
    secret configured on the GitHub App before any processing occurs.

    The endpoint returns HTTP 200 immediately. Heavy processing should be
    offloaded to an RQ background task.
    """
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    event_type = request.headers.get("X-GitHub-Event", "unknown")

    if not _verify_signature(body, signature):
        raise HTTPException(status_code=403, detail="Invalid GitHub signature")

    payload = json.loads(body)

    installation_id: int | None = payload.get("installation", {}).get("id")
    if not installation_id:
        # Some events (e.g. ping during app setup) may not carry an installation
        print(f"[github webhook] received '{event_type}' event with no installation_id — acking")
        return JSONResponse({"ok": True})

    user_id = _get_user_id_for_installation(installation_id)
    if not user_id:
        # Installation not found — may have been uninstalled; silently ack
        print(f"[github webhook] no user found for installation_id={installation_id} — acking")
        return JSONResponse({"ok": True})

    print(f"[github webhook] event='{event_type}' installation_id={installation_id} user_id={user_id}")

    # TODO: dispatch specific event handlers (e.g. push, pull_request) via RQ
    # Example: queue.enqueue(handle_github_event, event_type, payload, user_id)

    return JSONResponse({"ok": True})
