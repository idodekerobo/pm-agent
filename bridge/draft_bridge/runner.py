"""Claude Code subprocess runner and stream-json normalizer.

Entry point:
    async for event in run_claude(prompt, workspace_path, integration_tokens):
        # event is a normalized SSE dict ready to yield to the web app

Normalizer maps Claude Code stream-json events → web app SSE event shape:
    message     — streaming text chunk         {type, content}
    tool_call   — tool invocation              {type, name, call_id, arguments, content}
    tool_output — tool result                  {type, call_id, content}
    error       — execution error              {type, content}

Event types filtered out (never forwarded):
    system          — init metadata
    thinking        — Claude's internal reasoning blocks
    rate_limit_event — rate limit info
    result (success) — final roll-up; text was already streamed via message events
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
    """Convert one Claude Code stream-json event into zero or more SSE events."""
    event_type = cc_event.get("type")

    if event_type in ("system", "rate_limit_event"):
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

    if event_type == "tool":
        # Tool result — content can be a string or list of content blocks
        raw_content = cc_event.get("content", "")
        if isinstance(raw_content, list):
            parts = []
            for block in raw_content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
            content = "\n".join(parts)
        else:
            content = str(raw_content)
        return [{
            "type": "tool_output",
            "call_id": cc_event.get("tool_use_id", ""),
            "content": content,
        }]

    if event_type == "result":
        if cc_event.get("is_error") or cc_event.get("subtype") == "error_during_execution":
            return [{"type": "error", "content": cc_event.get("result", "Claude Code encountered an error.")}]
        return []  # success — text already streamed via message events

    return []  # unknown type


# ── Subprocess runner ─────────────────────────────────────────────────────────

async def run_claude(
    prompt: str,
    workspace_path: Path,
    integration_tokens: dict[str, str],
) -> AsyncGenerator[dict, None]:
    """Spawn `claude -p` and yield normalized SSE events.

    Yields dicts with `type` field. Caller is responsible for serializing
    to SSE format and writing conversation_items to Supabase.

    Raises RuntimeError if the `claude` binary is not found.
    """
    env = {**os.environ, **integration_tokens}

    try:
        proc = await asyncio.create_subprocess_exec(
            "claude", "-p", prompt,
            "--output-format", "stream-json",
            "--verbose",
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

    async for raw_line in proc.stdout:
        line = raw_line.decode(errors="replace").strip()
        if not line:
            continue
        try:
            cc_event = json.loads(line)
        except json.JSONDecodeError:
            logger.debug("Non-JSON line from claude: %r", line[:200])
            continue

        for sse_event in _normalize(cc_event):
            yield sse_event

    await proc.wait()

    if proc.returncode not in (0, None):
        stderr_bytes = await proc.stderr.read() if proc.stderr else b""
        stderr_text = stderr_bytes.decode(errors="replace").strip()
        error_msg = f"Claude Code exited with code {proc.returncode}"
        if stderr_text:
            error_msg += f": {stderr_text[:400]}"
        yield {"type": "error", "content": error_msg}
