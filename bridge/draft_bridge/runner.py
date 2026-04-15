"""Claude Code subprocess runner and stream-json normalizer.

Entry point:
    async for event in run_claude(prompt, workspace_path, integration_tokens):
        # event is a normalized dict ready to yield to the web app

Normalizer maps Claude Code stream-json events → web app event shape:
    message     — streaming text chunk         {type, content}
    tool_call   — tool invocation              {type, name, call_id, arguments, content}
    tool_output — tool result                  {type, call_id, content, is_error}
    error       — execution error              {type, content}

Internal events (intercepted by server.py, never forwarded to client):
    session_init    — carries provider session_id from system init event

Event types filtered out (never forwarded):
    thinking        — Claude's internal reasoning blocks (inside assistant events)
    rate_limit_event — rate limit info
    result (success) — final roll-up; text was already streamed via message events

Stream-json type mapping (per Agent SDK ToolResultBlock schema):
    assistant + text block      → message
    assistant + tool_use block  → tool_call
    assistant + thinking block  → (dropped)
    user + tool_result block    → tool_output   ← tool results live here, NOT type:"tool"
    result (is_error)           → error

Multi-turn notes:
    - Runs with -p (headless mode) for clean JSON output.
    - Pass resume_session_id to continue an existing Claude session across turns.
    - Claude maintains full conversation history on its side; bridge only stores the ID.
"""

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import AsyncGenerator

logger = logging.getLogger(__name__)


# ── Normalizer ────────────────────────────────────────────────────────────────

def _normalize(cc_event: dict) -> list[dict]:
    """Convert one Claude Code stream-json event into zero or more normalized events."""
    event_type = cc_event.get("type")

    if event_type == "system":
        # Capture session_id from the init event and surface it as an internal event.
        # server.py intercepts this to persist provider_session_id; it is never forwarded.
        if cc_event.get("subtype") == "init" and cc_event.get("session_id"):
            return [{"type": "session_init", "session_id": cc_event["session_id"]}]
        return []

    if event_type == "rate_limit_event":
        return []

    if event_type == "assistant":
        message = cc_event.get("message") or {}
        content_blocks = message.get("content") or []
        out = []
        for block in content_blocks:
            block_type = block.get("type")
            if block_type == "text":
                text = block.get("text", "")
                if text:
                    out.append({"type": "message", "content": text})
            elif block_type == "tool_use":
                tool_input = block.get("input") or {}
                out.append({
                    "type": "tool_call",
                    "name": block.get("name", ""),
                    "call_id": block.get("id", ""),
                    "arguments": json.dumps(tool_input),
                    "content": f"{block.get('name', '')}({json.dumps(tool_input)})",
                })
            # thinking blocks → skip (internal reasoning, not for display)
        return out

    # UserMessage (type: "user") carries ToolResultBlocks — these are tool outputs.
    # Note: the stream-json format never emits type: "tool"; tool results arrive as type: "user"
    # with message.content[].type == "tool_result" (per Agent SDK ToolResultBlock schema:
    # tool_use_id, content, is_error).
    if event_type == "user":
        message = cc_event.get("message") or {}
        content_blocks = message.get("content") or []
        out = []
        for block in content_blocks:
            if block.get("type") != "tool_result":
                continue
            raw_content = block.get("content", "")
            if isinstance(raw_content, list):
                text = "\n".join(
                    b.get("text", "") for b in raw_content
                    if isinstance(b, dict) and b.get("type") == "text"
                )
            else:
                text = str(raw_content)
            out.append({
                "type": "tool_output",
                "call_id": block.get("tool_use_id", ""),
                "content": text,
                "is_error": block.get("is_error", False),
            })
        return out

    if event_type == "result":
        if cc_event.get("is_error") or cc_event.get("subtype") == "error_during_execution":
            return [{"type": "error", "content": cc_event.get("result", "Claude Code encountered an error.")}]
        # Success result — emit a turn_end so server knows the turn is complete
        return [{"type": "turn_end"}]

    return []  # unknown type — logged by caller


# ── Subprocess runner ─────────────────────────────────────────────────────────

async def run_claude(
    prompt: str,
    workspace_path: Path,
    integration_tokens: dict[str, str],
    resume_session_id: str | None = None,
) -> AsyncGenerator[dict, None]:
    """Spawn `claude -p` in headless stream-json mode and yield normalized events.

    Pass resume_session_id to continue an existing Claude session (--resume flag).
    On the first turn, omit it; server.py will capture provider_session_id from
    the session_init event and persist it for use on subsequent turns.

    Yields dicts with `type` field. Caller is responsible for serializing
    to SSE/WS format and writing conversation_items to Supabase.

    Raises RuntimeError if the `claude` binary is not found.
    """
    draft_workspace = str(Path.home() / ".draft" / "workspace")
    env = {
        **os.environ,
        **integration_tokens,
        "DRAFT_WORKSPACE": draft_workspace,
    }

    workspace_claude_md = Path(draft_workspace) / "CLAUDE.md"
    cmd = [
        "claude",
        "--output-format", "stream-json",
        "--verbose",
        "--disallowedTools", "AskUserQuestion",
        "--add-dir", draft_workspace,
        "-p", prompt,
    ]
    if workspace_claude_md.exists():
        cmd += ["--append-system-prompt-file", str(workspace_claude_md)]
    if resume_session_id:
        cmd += ["--resume", resume_session_id]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(workspace_path),
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError:
        raise RuntimeError(
            "claude binary not found. Install Claude Code: https://claude.ai/download"
        )

    assert proc.stdout is not None

    logger.info("[runner] spawned claude pid=%s prompt_len=%d resume=%r", proc.pid, len(prompt), resume_session_id)

    async for raw_line in proc.stdout:
        line = raw_line.decode(errors="replace").strip()
        if not line:
            continue
        try:
            cc_event = json.loads(line)
        except json.JSONDecodeError:
            logger.debug("[runner] non-JSON stdout: %r", line[:200])
            continue

        normalized = _normalize(cc_event)
        for event in normalized:
            yield event

    await proc.wait()
    logger.info("[runner] claude exited returncode=%s", proc.returncode)

    if proc.returncode not in (0, None):
        stderr_bytes = await proc.stderr.read() if proc.stderr else b""
        stderr_text = stderr_bytes.decode(errors="replace").strip()
        error_msg = f"Claude Code exited with code {proc.returncode}"
        if stderr_text:
            error_msg += f": {stderr_text[:400]}"
        logger.error("[runner] %s", error_msg)
        yield {"type": "error", "content": error_msg}
