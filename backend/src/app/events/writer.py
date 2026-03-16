"""Event log writer — the single write primitive for all passive event ingestion.

All webhook handlers (Slack, GitHub, Linear) call append_event_log() to persist
structured events to the user's Modal Volume under /event_logs/.

Volume path convention:
    /event_logs/{provider}/{safe_resource}/{YYYY-MM-DD}.jsonl

The `resource` stored inside the JSON event dict is the original form (e.g. "org/repo-name").
The path uses _sanitize_resource() to make it filesystem-safe (e.g. "org--repo-name").

Append pattern:
    Read existing file bytes → append new JSON line → write back.
    Modal Volumes have no native append — this is a read-modify-write.

Concurrent write caveat:
    Two simultaneous webhooks for the same file = last-write-wins. Acceptable
    at current webhook volumes. Add batching (Redis buffer + periodic flush) only
    if throughput becomes a real problem.
"""

from __future__ import annotations

import asyncio
import io
import json
from datetime import datetime, timezone
from pathlib import Path

from app.config import settings


def _sanitize_resource(resource: str) -> str:
    """Make a resource string safe for use as a directory name component.

    GitHub resources use 'org/repo' — '/' is replaced with '--' so it doesn't
    create unintended subdirectory nesting in the volume path.
    """
    return resource.replace("/", "--")


def _build_log_path(provider: str, resource: str, date_str: str) -> str:
    """Build the volume-absolute path for a JSONL event log file.

    Format: /event_logs/{provider}/{safe_resource}/{YYYY-MM-DD}.jsonl
    """
    safe = _sanitize_resource(resource)
    return f"/event_logs/{provider}/{safe}/{date_str}.jsonl"


async def append_event_log(
    user_id: str,
    provider: str,
    resource: str,
    event_dict: dict,
) -> None:
    """Append one event to the user's JSONL event log for this provider+resource+day.

    Args:
        user_id:    The authenticated user's ID (used to resolve their Modal Volume).
        provider:   "slack" | "github" | "linear"
        resource:   Provider-scoped identifier in its original form:
                      Slack:   "C04ABCD123-general"
                      GitHub:  "org/repo-name"
                      Linear:  "ENG"
        event_dict: Validated event data (from SlackEvent, GitHubEvent, or LinearEvent).
                    Pass event.model_dump() from the caller.

    Production: Modal Volume read-modify-write.
    Local dev:  Local filesystem under /tmp/pm-agent-dev/{user_id}/event_logs/...
    """
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    log_path = _build_log_path(provider, resource, date_str)
    new_line = (json.dumps(event_dict) + "\n").encode("utf-8")

    if settings.workspace_backend == "production":
        await _append_modal(user_id, log_path, new_line)
    else:
        _append_local(user_id, log_path, new_line)


async def _append_modal(user_id: str, path: str, new_line: bytes) -> None:
    from app.workspace.modal_sandbox import get_or_create_volume

    vol = get_or_create_volume(user_id)

    # Read existing file (empty bytes if it doesn't exist yet)
    existing = b""
    try:
        chunks: list[bytes] = []
        async for chunk in vol.read_file.aio(path):
            chunks.append(chunk)
        existing = b"".join(chunks)
    except Exception as exc:
        exc_str = str(exc).lower()
        if "not found" in exc_str or "no such" in exc_str:
            pass  # file doesn't exist yet — start fresh
        else:
            print(f"[events] WARNING: unexpected error reading {path!r}: {exc}", flush=True)

    updated = existing + new_line

    def _write() -> None:
        with vol.batch_upload(force=True) as batch:
            batch.put_file(io.BytesIO(updated), path)

    try:
        await asyncio.to_thread(_write)
    except Exception as exc:
        print(f"[events] ERROR writing {path!r} for user {user_id!r}: {type(exc).__name__}: {exc}", flush=True)
        raise


def _append_local(user_id: str, path: str, new_line: bytes) -> None:
    """Local dev fallback. Writes to /tmp/pm-agent-dev/{user_id}/event_logs/..."""
    local_root = Path(f"/tmp/pm-agent-dev/{user_id}")
    target = local_root / path.lstrip("/")
    target.parent.mkdir(parents=True, exist_ok=True)
    with open(target, "ab") as f:
        f.write(new_line)
