"""GitHub App webhook receiver."""

import hashlib
import hmac
import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.db.supabase_client import get_supabase
from app.workers.queue import queue
from app.workers.background_monitoring import process_github_background_event

# Event types dispatched to the passive monitoring event processor (Phase 1).
_TRACKED_EVENT_TYPES = {"pull_request", "pull_request_review"}

# Event types handled directly in this receiver for config/state sync.
_INSTALLATION_EVENT_TYPES = {"installation", "installation_repositories"}

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


def _handle_installation_repositories(user_id: str, payload: dict) -> None:
    """Update repo_monitoring_config when the user adds or removes repos
    from the GitHub App installation on GitHub's settings page.

    Repos added → inserted with monitoring_enabled=true (if not already tracked).
    Repos removed → deleted from the config map.
    """
    supabase = get_supabase()
    added = [r["full_name"] for r in payload.get("repositories_added", [])]
    removed = {r["full_name"] for r in payload.get("repositories_removed", [])}

    row = (
        supabase.table("github_installations")
        .select("repo_monitoring_config")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    config: dict = (row.data or {}).get("repo_monitoring_config") or {}

    for full_name in added:
        if full_name not in config:
            config[full_name] = True
    for full_name in removed:
        config.pop(full_name, None)

    supabase.table("github_installations").update(
        {"repo_monitoring_config": config}
    ).eq("user_id", user_id).execute()
    print(f"[github webhook] repo_monitoring_config updated for user={user_id}: +{added} -{list(removed)}")


def _handle_installation_deleted(installation_id: int, user_id: str) -> None:
    """Clean up all records when the GitHub App is uninstalled.

    Deletes github_installations and the integrations row. Skills are
    deprovisioned via the existing RQ task.
    """
    supabase = get_supabase()
    supabase.table("github_installations").delete().eq("installation_id", installation_id).execute()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "github").execute()
    queue.enqueue("app.workers.tasks.deprovision_skill", user_id, "github")
    print(f"[github webhook] installation {installation_id} deleted — cleaned up for user={user_id}")


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
    print(f"[github webhook] received '{event_type}' event")

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

    delivery_id = request.headers.get("X-GitHub-Delivery", "")
    print(f"[github webhook] event='{event_type}' delivery_id={delivery_id} installation_id={installation_id} user_id={user_id}")

    if event_type == "installation_repositories":
        _handle_installation_repositories(user_id, payload)

    elif event_type == "installation" and payload.get("action") == "deleted":
        _handle_installation_deleted(installation_id, user_id)

    elif event_type in _TRACKED_EVENT_TYPES:
        queue.enqueue(
            process_github_background_event,
            event_type,
            delivery_id,
            payload,
            user_id,
        )

    return JSONResponse({"ok": True})
