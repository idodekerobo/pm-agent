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
  GET  /health        — bridge presence check, returns {status, version, workspace}
  GET  /fs/list       — list workspace subdirectories for the file browser
  POST /seed-context  — write onboarding profile to ~/.draft/workspace/context/ (idempotent)
  POST /run-local     — spawn Claude Code, SSE stream back, write to Supabase
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
from draft_bridge.supabase_writer import make_assistant_item, make_tool_call_item, make_tool_output_item, make_user_item, patch_session_provider_id, write_item

logger = logging.getLogger(__name__)


async def _do_refresh_jwt(supabase_url: str, anon_key: str, refresh_token: str) -> tuple[str, str]:
    """Exchange a Supabase refresh token for a new access + refresh token pair."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{supabase_url}/auth/v1/token",
            params={"grant_type": "refresh_token"},
            headers={"apikey": anon_key, "Content-Type": "application/json"},
            json={"refresh_token": refresh_token},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        return data["access_token"], data["refresh_token"]


async def _call_with_retry(coro_fn, auth: dict, supabase_url: str, anon_key: str):
    """Call coro_fn(jwt). On 401, refresh the token and retry once."""
    try:
        return await coro_fn(auth["jwt"])
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code != 401 or not auth.get("refresh_token"):
            raise
        logger.info("[server] JWT expired mid-run, refreshing...")
        auth["jwt"], auth["refresh_token"] = await _do_refresh_jwt(supabase_url, anon_key, auth["refresh_token"])
        return await coro_fn(auth["jwt"])

_VERSION = "0.1.0"

_DRAFT_WORKSPACE = Path.home() / ".draft" / "workspace"

# Maps integration token env var keys → skill names in the workspace template.
# Must stay in sync with _PROVIDER_ENV_VAR in backend/src/app/api/routes/bridge.py.
_TOKEN_SKILL_MAP: dict[str, list[str]] = {
    "LINEAR_API_KEY":       ["linear"],
    "GITHUB_TOKEN":         ["github"],
    "GOOGLE_ACCESS_TOKEN":  ["google-drive", "google-docs"],
    "NOTION_API_KEY":       ["notion"],
    "SLACK_BOT_TOKEN":      ["slack"],
    "POSTHOG_API_KEY":      ["posthog"],
}

# The exact line in workspace_template/CLAUDE.md that lists all skills.
# _build_claude_md replaces this with only the connected ones.
_SKILLS_PLACEHOLDER = (
    "Connected skills available: "
    "`linear`, `github`, `google-drive`, `google-docs`, `notion`, `posthog`, `slack`"
)


def _build_claude_md(integration_tokens: dict) -> str:
    """Return CLAUDE.md content with the skills line filtered to connected integrations only."""
    template_path = Path(__file__).parent.parent / "workspace_template" / "CLAUDE.md"
    template = template_path.read_text(encoding="utf-8")

    connected: list[str] = []
    for env_var, skills in _TOKEN_SKILL_MAP.items():
        if integration_tokens.get(env_var):
            connected.extend(skills)

    skills_line = (
        "Connected skills available: " + ", ".join(f"`{s}`" for s in connected)
        if connected
        else "No integrations connected. Connect integrations at draftai.us/settings."
    )

    return template.replace(_SKILLS_PLACEHOLDER, skills_line)


def _write_claude_md(integration_tokens: dict) -> None:
    """Write a dynamically generated CLAUDE.md to the draft workspace."""
    dest = _DRAFT_WORKSPACE / "CLAUDE.md"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(_build_claude_md(integration_tokens), encoding="utf-8")


# ── Context seeding ───────────────────────────────────────────────────────────

def _seed_workspace_context(profile: dict) -> None:
    """Pre-populate workspace context index files with onboarding profile data.

    Only writes to files whose description is still "No information recorded yet"
    — never overwrites content that was set by the user or the setup interview.
    Creates parent dirs if needed (safe if bootstrap hasn't run yet).
    """
    import datetime

    def _is_stub(path: Path) -> bool:
        """Return True if the file doesn't exist or still has the blank stub description."""
        if not path.exists():
            return True
        text = path.read_text(encoding="utf-8")
        return "No information recorded yet" in text

    today = datetime.date.today().isoformat()

    company_url = (profile.get("company_url") or "").strip()
    scrape_observations = (profile.get("onboarding_scrape_observations") or "").strip()
    scrape_correction = (profile.get("onboarding_scrape_correction") or "").strip()
    full_name = (profile.get("full_name") or "").strip()
    role = (profile.get("role") or "").strip()
    current_focus: list = profile.get("current_focus") or []
    daily_activities: list = profile.get("daily_activities") or []
    imported_memories: list = profile.get("imported_memories") or []

    # context/company/index.md
    company_file = _DRAFT_WORKSPACE / "context" / "company" / "index.md"
    if _is_stub(company_file) and (company_url or scrape_observations):
        company_file.parent.mkdir(parents=True, exist_ok=True)
        desc_parts = []
        if company_url:
            desc_parts.append(f"Company URL: {company_url}.")
        if scrape_observations:
            first_line = scrape_observations.strip().splitlines()[0].strip()
            if first_line:
                desc_parts.append(first_line[:200])
        if scrape_correction:
            desc_parts.append(f"User correction: {scrape_correction[:100]}")
        description = " ".join(desc_parts) or "No information recorded yet."
        body_parts = []
        if company_url:
            body_parts += [f"**URL:** {company_url}"]
        if scrape_observations:
            body_parts += ["", "## What They Build", scrape_observations]
        if scrape_correction:
            body_parts += ["", "## User Correction", scrape_correction]
        body = "\n".join(body_parts)
        company_file.write_text(
            f"---\nname: company\ndescription: >\n  {description}\nlast_updated: {today}\nsource: onboarding\n---\n\n{body}\n",
            encoding="utf-8",
        )
        logger.info("[seed] wrote context/company/index.md")

    # context/user/index.md
    user_file = _DRAFT_WORKSPACE / "context" / "user" / "index.md"
    if _is_stub(user_file) and (full_name or role):
        user_file.parent.mkdir(parents=True, exist_ok=True)
        desc_parts = []
        if full_name:
            desc_parts.append(f"{full_name}.")
        if role:
            desc_parts.append(f"Role: {role}.")
        if current_focus:
            desc_parts.append(f"Current focus: {', '.join(current_focus[:3])}.")
        description = " ".join(desc_parts) or "No information recorded yet."
        body_parts = []
        if full_name:
            body_parts += [f"**Name:** {full_name}"]
        if role:
            body_parts += [f"**Role:** {role}"]
        if current_focus:
            body_parts += ["", "## Current Focus"] + [f"- {item}" for item in current_focus]
        if daily_activities:
            body_parts += ["", "## Daily Activities"] + [f"- {item}" for item in daily_activities]
        body = "\n".join(body_parts)
        user_file.write_text(
            f"---\nname: user\ndescription: >\n  {description}\nlast_updated: {today}\nsource: onboarding\n---\n\n{body}\n",
            encoding="utf-8",
        )
        logger.info("[seed] wrote context/user/index.md")

    # memory/memory.md — imported memories from prior tools (e.g. Claude memory export)
    if imported_memories:
        memory_file = _DRAFT_WORKSPACE / "memory" / "memory.md"
        if not memory_file.exists() or memory_file.read_text(encoding="utf-8").strip() == "":
            memory_file.parent.mkdir(parents=True, exist_ok=True)
            lines = ["## Vocabulary", "", "## Preferences", ""]
            for mem in imported_memories:
                provider = (mem.get("provider") or "imported").strip()
                content = (mem.get("content") or "").strip()
                if content:
                    lines += [f"_Imported from {provider}:_ {content}", ""]
            lines += ["## Goals", "", "## Patterns"]
            memory_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
            logger.info("[seed] wrote memory/memory.md")


def _fetch_and_seed_context_on_startup(bridge_token: str) -> None:
    """Fetch user profile from cloud and seed context files if they are empty.

    Called once at bridge startup. Safe to call repeatedly — only writes to
    files that are missing or contain no content.
    """
    try:
        resp = httpx.get(
            f"{CLOUD_API_BASE_URL}/bridge/profile",
            headers={"Authorization": f"Bearer {bridge_token}"},
            timeout=10,
        )
        resp.raise_for_status()
        _seed_workspace_context(resp.json())
        click.echo("  ✓ Workspace context seeded from profile.")
    except Exception as exc:
        click.echo(f"Warning: could not seed context from profile ({exc}). Continuing.")


# ── Routes ────────────────────────────────────────────────────────────────────

async def health(request: Request) -> JSONResponse:
    return JSONResponse({
        "status": "ok",
        "version": _VERSION,
        "workspace": str(request.app.state.workspace_path),
    })


async def fs_list(request: Request) -> JSONResponse:
    """GET /fs/list?path=<dir> — list subdirectories for the file browser.

    If `path` is omitted, defaults to the bridge startup workspace.
    Returns only directories (hidden dirs excluded).
    """
    raw_path = request.query_params.get("path")
    if raw_path:
        target = Path(raw_path).expanduser().resolve()
    else:
        target = request.app.state.workspace_path

    if not target.is_dir():
        return JSONResponse({"error": f"not a directory: {target}"}, status_code=400)

    entries = []
    try:
        for entry in sorted(target.iterdir(), key=lambda e: e.name.lower()):
            if entry.is_dir() and not entry.name.startswith("."):
                entries.append({"name": entry.name, "path": str(entry)})
    except PermissionError:
        return JSONResponse({"error": "permission denied"}, status_code=403)

    parent = str(target.parent) if target != target.parent else None
    return JSONResponse({"path": str(target), "parent": parent, "entries": entries})


async def refresh_tokens(request: Request) -> JSONResponse:
    """POST /refresh-tokens — re-fetch integration tokens from cloud and update app state.

    Called by the web app immediately after a user connects a new integration.
    Updates app.state.integration_tokens in-place and rewrites CLAUDE.md so
    the new skill is available on the very next run without restarting the bridge.
    """
    state = request.app.state
    new_tokens = _fetch_integration_tokens(state.bridge_token)
    state.integration_tokens.clear()
    state.integration_tokens.update(new_tokens)
    _write_claude_md(new_tokens)
    logger.info("[server] /refresh-tokens updated connected integrations: %s", list(new_tokens.keys()))
    return JSONResponse({"status": "ok", "connected": list(new_tokens.keys())})


async def seed_context(request: Request) -> JSONResponse:
    """POST /seed-context — write onboarding profile data to workspace context files.

    Called from the web app at onboarding finish when the bridge is connected.
    Idempotent: only writes files that are missing or empty.

    Request body: same shape as ProfilePayload in the cloud API —
      {full_name, role, company_url, onboarding_scrape_observations,
       onboarding_scrape_correction, current_focus, daily_activities, imported_memories}
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid_json"}, status_code=400)

    try:
        _seed_workspace_context(body)
    except Exception as exc:
        logger.error("[seed_context] failed: %s", exc, exc_info=True)
        return JSONResponse({"error": str(exc)}, status_code=500)

    return JSONResponse({"status": "ok"})


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
    refresh_token: str = body.get("refresh_token", "")
    body_workspace: str | None = body.get("workspace_path")
    resume_session_id: str | None = body.get("provider_session_id") or None

    if not session_id or not prompt or not jwt:
        return JSONResponse({"error": "session_id, prompt, and jwt are required"}, status_code=400)

    auth = {"jwt": jwt, "refresh_token": refresh_token}

    state = request.app.state

    if body_workspace:
        candidate = Path(body_workspace).expanduser().resolve()
        if not candidate.is_dir():
            return JSONResponse({"error": f"workspace_path does not exist: {body_workspace}"}, status_code=400)
        workspace_path: Path = candidate
    else:
        workspace_path: Path = state.workspace_path
    integration_tokens: dict = state.integration_tokens
    supabase_url: str = state.supabase_url
    supabase_anon_key: str = state.supabase_anon_key

    async def event_stream():
        def sse(event: dict) -> str:
            return f"data: {json.dumps(event)}\n\n"

        # 1. Write user item → emit item_created
        try:
            user_item_id = await _call_with_retry(
                lambda j: write_item(supabase_url, supabase_anon_key, j, session_id=session_id, item=make_user_item(prompt)),
                auth, supabase_url, supabase_anon_key,
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
            async for event in run_claude(prompt, workspace_path, integration_tokens, resume_session_id):
                event_type = event["type"]

                if event_type == "session_init":
                    # Internal event — persist provider_session_id, emit to client so
                    # web app can store it for --resume on subsequent turns.
                    new_provider_session_id = event.get("session_id", "")
                    try:
                        await _call_with_retry(
                            lambda j: patch_session_provider_id(supabase_url, supabase_anon_key, j, session_id=session_id, provider_session_id=new_provider_session_id),
                            auth, supabase_url, supabase_anon_key,
                        )
                        yield sse({"type": "session_provider_id", "provider_session_id": new_provider_session_id})
                    except Exception as exc:
                        logger.error("Failed to patch provider_session_id: %s", exc)
                    continue

                if event_type == "message":
                    full_text += event.get("content", "")
                elif event_type == "tool_call":
                    call_id = event.get("call_id", "")
                    try:
                        tc_item_id = await _call_with_retry(
                            lambda j: write_item(supabase_url, supabase_anon_key, j, session_id=session_id, item=make_tool_call_item(name=event.get("name", ""), call_id=call_id, arguments=event.get("arguments", "{}")), parent_id=user_item_id),
                            auth, supabase_url, supabase_anon_key,
                        )
                        tool_call_item_ids[call_id] = tc_item_id
                        logger.info("[server] wrote tool_call item call_id=%r db_id=%r", call_id, tc_item_id)
                    except Exception as exc:
                        logger.error("Failed to write tool_call item: %s", exc)
                elif event_type == "tool_output":
                    call_id = event.get("call_id", "")
                    parent_id = tool_call_item_ids.get(call_id) or user_item_id
                    try:
                        await _call_with_retry(
                            lambda j: write_item(supabase_url, supabase_anon_key, j, session_id=session_id, item=make_tool_output_item(call_id=call_id, output=event.get("content", ""), is_error=event.get("is_error", False)), parent_id=parent_id),
                            auth, supabase_url, supabase_anon_key,
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
                assistant_item_id = await _call_with_retry(
                    lambda j: write_item(supabase_url, supabase_anon_key, j, session_id=session_id, item=make_assistant_item(full_text), parent_id=user_item_id),
                    auth, supabase_url, supabase_anon_key,
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
        Route("/fs/list", fs_list, methods=["GET"]),
        Route("/refresh-tokens", refresh_tokens, methods=["POST"]),
        Route("/seed-context", seed_context, methods=["POST"]),
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
            click.echo("No integration tokens found (connect integrations at app.draftai.us/settings).")
        return tokens
    except Exception as exc:
        click.echo(f"Warning: could not fetch integration tokens ({exc}). Continuing without integrations.")
        return {}


def run(workspace_path: Path | None = None) -> None:
    """Called by `draft-bridge start`. Blocks until the server is stopped."""
    bridge_token = keychain.load_token()
    if not bridge_token:
        raise click.ClickException(
            "Not authenticated. Run `draft-bridge auth` first."
        )

    if workspace_path is None:
        workspace_path = Path.cwd()
    click.echo(f"Workspace: {workspace_path}")

    click.echo("Fetching startup bundle from Draft Cloud...")
    try:
        bundle = tls_module.fetch_and_cache(bridge_token)
    except Exception as exc:
        raise click.ClickException(f"Failed to fetch startup bundle: {exc}")

    integration_tokens = _fetch_integration_tokens(bridge_token)
    _write_claude_md(integration_tokens)
    _fetch_and_seed_context_on_startup(bridge_token)

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
