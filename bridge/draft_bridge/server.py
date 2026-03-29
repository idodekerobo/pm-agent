"""Bridge HTTP server — C2/C3.

Starts the Starlette/uvicorn HTTPS server on local.draftai.us:7349.

Startup sequence (called by `draft-bridge start`):
  1. Load bridge token from OS keychain
  2. Fetch startup bundle from Draft Cloud (TLS cert/key + Supabase config)
  3. Fetch integration tokens from Draft Cloud (cached for session lifetime)
  4. Build Starlette app
  5. Start Slack relay WebSocket in background (C5)
  6. Start uvicorn with SSL

Endpoints:
  GET  /health       — bridge presence check, returns {status, version, workspace}
  POST /run-local    — spawn Claude Code, SSE stream back, write to Supabase
"""

import asyncio
import json
import logging
from pathlib import Path

import click
import httpx
import uvicorn
from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route

from draft_bridge import keychain, tls as tls_module
from draft_bridge.constants import ALLOWED_ORIGINS, BRIDGE_PORT, CLOUD_API_BASE_URL
from draft_bridge.runner import run_claude
from draft_bridge.slack_relay import run_relay
from draft_bridge.supabase_writer import make_assistant_item, make_tool_call_item, make_tool_output_item, make_user_item, write_item

logger = logging.getLogger(__name__)

_VERSION = "0.1.0"


# ── Routes ────────────────────────────────────────────────────────────────────

async def health(request: Request) -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "version": _VERSION,
        "workspace": str(request.app.state.workspace_path),
    })


async def run_local(request: Request) -> StreamingResponse:
    """POST /run-local — spawn Claude Code and stream SSE back to the web app.

    Request body: {session_id, prompt, jwt}
      session_id — UUID created by the web app before this call
      prompt     — user message text
      jwt        — Supabase access token for writing conversation_items

    SSE events emitted:
      item_created (role: user)        — after writing user item to Supabase
      message                          — streaming text chunks from Claude Code
      tool_call / tool_output          — tool invocations and results
      item_created (role: assistant)   — after writing assistant item to Supabase
      error                            — on any failure
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid_json"}, status_code=400)

    session_id: str = body.get("session_id", "")
    prompt: str = body.get("prompt", "")
    jwt: str = body.get("jwt", "")

    if not session_id or not prompt or not jwt:
        return JSONResponse({"error": "session_id, prompt, and jwt are required"}, status_code=400)

    state = request.app.state
    workspace_path: Path = state.workspace_path
    integration_tokens: dict = state.integration_tokens
    supabase_url: str = state.supabase_url
    supabase_anon_key: str = state.supabase_anon_key

    async def event_stream():
        def sse(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        # 1. Write user item → emit item_created
        try:
            user_item_id = await write_item(
                supabase_url, supabase_anon_key, jwt,
                session_id=session_id,
                item=make_user_item(prompt),
            )
            yield sse({"type": "item_created", "role": "user", "id": user_item_id})
        except Exception as exc:
            logger.error("Failed to write user item: %s", exc)
            yield sse({"type": "error", "content": "Failed to save message. Check your connection."})
            return

        # 2. Stream Claude Code output + write tool items to Supabase immediately
        full_text = ""
        tool_call_item_ids: dict[str, str] = {}  # call_id → db item id
        try:
            async for event in run_claude(prompt, workspace_path, integration_tokens):
                event_type = event["type"]

                if event_type == "message":
                    full_text += event.get("content", "")
                elif event_type == "tool_call":
                    call_id = event.get("call_id", "")
                    try:
                        tc_item_id = await write_item(
                            supabase_url, supabase_anon_key, jwt,
                            session_id=session_id,
                            item=make_tool_call_item(
                                name=event.get("name", ""),
                                call_id=call_id,
                                arguments=event.get("arguments", "{}"),
                            ),
                            parent_id=user_item_id,
                        )
                        tool_call_item_ids[call_id] = tc_item_id
                        logger.info("[server] wrote tool_call item call_id=%r db_id=%r", call_id, tc_item_id)
                    except Exception as exc:
                        logger.error("Failed to write tool_call item: %s", exc)
                elif event_type == "tool_output":
                    call_id = event.get("call_id", "")
                    parent_id = tool_call_item_ids.get(call_id) or user_item_id
                    try:
                        await write_item(
                            supabase_url, supabase_anon_key, jwt,
                            session_id=session_id,
                            item=make_tool_output_item(
                                call_id=call_id,
                                output=event.get("content", ""),
                                is_error=event.get("is_error", False),
                            ),
                            parent_id=parent_id,
                        )
                        logger.info("[server] wrote tool_output item call_id=%r is_error=%r", call_id, event.get("is_error"))
                    except Exception as exc:
                        logger.error("Failed to write tool_output item: %s", exc)

                logger.info("[server] -> yield SSE type=%r call_id=%r",
                            event.get("type"), event.get("call_id"))
                yield sse(event)
        except RuntimeError as exc:
            yield sse({"type": "error", "content": str(exc)})
            return
        except Exception as exc:
            logger.error("Claude Code run failed: %s", exc, exc_info=True)
            yield sse({"type": "error", "content": "Claude Code encountered an unexpected error."})
            return

        # 3. Write assistant item → emit item_created
        if full_text:
            try:
                assistant_item_id = await write_item(
                    supabase_url, supabase_anon_key, jwt,
                    session_id=session_id,
                    item=make_assistant_item(full_text),
                    parent_id=user_item_id,
                )
                yield sse({"type": "item_created", "role": "assistant", "id": assistant_item_id})
            except Exception as exc:
                logger.error("Failed to write assistant item: %s", exc)
                # Don't surface DB write failure as an error — response was already streamed

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── App factory ───────────────────────────────────────────────────────────────

def _create_app(
    workspace_path: Path,
    bridge_token: str,
    integration_tokens: dict,
    supabase_url: str,
    supabase_anon_key: str,
) -> Starlette:
    app = Starlette(routes=[
        Route("/health", health, methods=["GET"]),
        Route("/run-local", run_local, methods=["POST"]),
    ])
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=True,
    )
    app.state.workspace_path = workspace_path
    app.state.bridge_token = bridge_token
    app.state.integration_tokens = integration_tokens
    app.state.supabase_url = supabase_url
    app.state.supabase_anon_key = supabase_anon_key
    return app


# ── Slack event handler (C5) ──────────────────────────────────────────────────

def _make_slack_handler(app: Starlette):
    """Return the Slack event handler bound to app.state."""

    async def handle_slack_event(ws, payload: dict) -> None:
        """Receive a Slack event, run Claude Code, send response back via WS.

        Phase 1 (Option A): response is sent back to cloud WS → cloud posts to Slack.
        """
        event = payload.get("event", {})
        channel = event.get("channel", "")
        thread_ts = event.get("thread_ts") or event.get("ts", "")
        text = event.get("text", "")

        if not text:
            return

        logger.info("Slack event: channel=%s text=%r", channel, text[:80])

        full_text = ""
        try:
            async for cc_event in run_claude(
                text,
                app.state.workspace_path,
                app.state.integration_tokens,
            ):
                if cc_event["type"] == "message":
                    full_text += cc_event.get("content", "")
        except Exception as exc:
            logger.error("Claude Code run for Slack failed: %s", exc)
            full_text = "Sorry, I encountered an error processing your request."

        response_payload = {
            "type": "slack_response",
            "payload": {
                "channel": channel,
                "thread_ts": thread_ts,
                "text": full_text or "(No response generated.)",
            },
        }
        await ws.send(json.dumps(response_payload))

    return handle_slack_event


# ── Entry point ───────────────────────────────────────────────────────────────

def _fetch_integration_tokens(bridge_token: str) -> dict:
    """Fetch integration tokens from cloud. Returns empty dict if unavailable."""
    try:
        resp = httpx.get(
            f"{CLOUD_API_BASE_URL}/bridge/integration-tokens",
            headers={"Authorization": f"Bearer {bridge_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        tokens = resp.json()
        if tokens:
            click.echo(f"Integration tokens loaded: {', '.join(tokens.keys())}")
        else:
            click.echo("No integration tokens found (connect integrations at draftai.us/settings).")
        return tokens
    except Exception as exc:
        click.echo(f"Warning: could not fetch integration tokens ({exc}). Continuing without integrations.")
        return {}


def run() -> None:
    """Called by `draft-bridge start`. Blocks until the server is stopped."""
    bridge_token = keychain.load_token()
    if not bridge_token:
        raise click.ClickException(
            "Not authenticated. Run `draft-bridge auth` first."
        )

    workspace_path = Path.cwd()
    click.echo(f"Workspace: {workspace_path}")

    click.echo("Fetching startup bundle from Draft Cloud...")
    try:
        bundle = tls_module.fetch_and_cache(bridge_token)
    except Exception as exc:
        raise click.ClickException(f"Failed to fetch startup bundle: {exc}")

    integration_tokens = _fetch_integration_tokens(bridge_token)

    click.echo(f"Starting bridge on https://local.draftai.us:{BRIDGE_PORT}")

    app = _create_app(
        workspace_path=workspace_path,
        bridge_token=bridge_token,
        integration_tokens=integration_tokens,
        supabase_url=bundle.supabase_url,
        supabase_anon_key=bundle.supabase_anon_key,
    )

    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=BRIDGE_PORT,
        ssl_certfile=str(bundle.cert_path),
        ssl_keyfile=str(bundle.key_path),
        log_level="warning",
    )
    server = uvicorn.Server(config)
    slack_handler = _make_slack_handler(app)

    async def _serve() -> None:
        slack_token = integration_tokens.get("slack")
        if slack_token:
            relay_task = asyncio.create_task(
                run_relay(bridge_token, slack_handler)
            )
        else:
            click.echo("Slack not connected — relay disabled.")
            relay_task = None
        try:
            await server.serve()
        finally:
            if relay_task:
                relay_task.cancel()
                try:
                    await relay_task
                except asyncio.CancelledError:
                    pass

    asyncio.run(_serve())
