"""
Inbound hook endpoint called by Claude Code running inside a Modal sandbox.

Claude Code is configured (via .claude/settings.json written before execution)
to POST here on PostToolUse events. This writes a progress message to the
conversation_items table so the user sees live updates in the chat thread.

Auth: pre-shared secret injected as HOOK_SECRET env var into the sandbox,
sent here as "Authorization: Bearer {secret}". Simple bearer check is
sufficient — we control both ends of this call.
"""
import secrets

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.db.supabase_client import get_supabase
from app.db.code_tasks import get_code_task
from app.db.conversations import append_conversation_item

router = APIRouter(prefix="/claude-code")


class HookPayload(BaseModel):
    task_id: str
    tool: str           # e.g. "Write", "Bash", "Edit"
    file_path: str      # path of the file written/edited, extracted from Claude Code's hook stdin


@router.post("/hook")
async def code_task_hook(
    payload: HookPayload,
    authorization: str = Header(...),
):
    """Receive a PostToolUse hook call from Claude Code inside a sandbox."""
    _verify_secret(authorization)

    supabase = get_supabase()

    try:
        task = get_code_task(supabase, task_id=payload.task_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Code task not found.")

    if task.status not in ("running",):
        # Ignore hooks for tasks that aren't actively running
        return {"ok": True}

    message = f"**[{payload.tool}]** `{payload.file_path}`"
    item = {
        "role": "assistant",
        "type": "code_task_update",
        "content": [{"type": "output_text", "text": message}],
        "code_task_id": payload.task_id,
        "code_task_status": task.status,
    }
    append_conversation_item(
        supabase,
        agent_session_id=str(task.agent_session_id),
        item=item,
    )

    return {"ok": True}


def _verify_secret(authorization: str) -> None:
    """Constant-time comparison to prevent timing attacks."""
    expected = f"Bearer {settings.code_task_hook_secret}"
    if not settings.code_task_hook_secret:
        raise HTTPException(status_code=500, detail="Hook secret not configured.")
    if not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized.")
