"""Linear webhook receiver.

Receives event payloads from Linear and routes them to the appropriate handler.

Security: every request is verified with HMAC-SHA256 using the linear_webhook_secret
configured in the Linear workspace settings before any processing occurs.

Endpoint: POST /webhook/linear
"""

import hashlib
import hmac
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/linear")


def _verify_signature(body: bytes, signature_header: str) -> bool:
    """Verify the linear-signature header using HMAC-SHA256.

    Linear signs every webhook payload with the secret configured on the webhook.
    The header value is the raw hex digest (no prefix).
    """
    if not signature_header:
        return False
    expected = hmac.new(
        settings.linear_webhook_secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def _get_user_id_for_workspace(workspace_id: str) -> str | None:
    """Look up the user_id for a given Linear workspace (organization) ID."""
    supabase = get_supabase()
    result = (
        supabase.table("linear_installations")
        .select("user_id")
        .eq("linear_workspace_id", workspace_id)
        .maybe_single()
        .execute()
    )
    if result and result.data:
        return result.data["user_id"]
    return None


def _handle_authorization_revoked(workspace_id: str, user_id: str) -> None:
    """Clean up all Linear records when the app authorization is revoked.

    Deletes linear_installations (linear_teams CASCADE) and the integrations row.
    Skills are deprovisioned via the existing RQ task.
    """
    from app.workers.queue import queue

    supabase = get_supabase()
    supabase.table("linear_installations").delete().eq("user_id", user_id).execute()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "linear").execute()
    queue.enqueue("app.workers.tasks.deprovision_skill", user_id, "linear")
    print(f"[linear webhook] authorization revoked — cleaned up for user={user_id} workspace={workspace_id}")


@router.post("")
async def linear_webhook(request: Request):
    """Receive all Linear webhook payloads.

    Returns HTTP 200 immediately. Config-sync operations (authorization revoked)
    are handled synchronously since they are fast DB operations. Phase 1 passive
    monitoring events will be offloaded to RQ background tasks.
    """
    body = await request.body()
    signature = request.headers.get("linear-signature", "")

    if not settings.linear_webhook_secret:
        raise HTTPException(status_code=500, detail="Linear webhook secret not configured.")

    if not _verify_signature(body, signature):
        raise HTTPException(status_code=403, detail="Invalid Linear signature")

    payload = json.loads(body)
    event_type = payload.get("type", "unknown")
    workspace_id = payload.get("organizationId")

    print(f"[linear webhook] received '{event_type}' event for workspace={workspace_id}")

    if not workspace_id:
        return JSONResponse({"ok": True})

    if event_type == "AppUserAuthorizationRevoked":
        user_id = _get_user_id_for_workspace(workspace_id)
        if user_id:
            _handle_authorization_revoked(workspace_id, user_id)
        else:
            print(f"[linear webhook] no user found for workspace={workspace_id} — acking")

    # Phase 1 passive monitoring events will be dispatched here (Issue, Comment, etc.)
    # See plan 0010 Phase 1.4 for implementation.

    return JSONResponse({"ok": True})
