"""Bridge auth, TLS bundle, integration tokens, and WebSocket relay endpoints.

— POST /bridge/token
    Supabase-authed user requests a long-lived bridge token, stored as SHA-256
    hash in bridge_tokens table. Raw token returned once; bridge stores in OS
    keychain. DELETE /bridge/token revokes all active tokens for the user.

— GET /bridge/tls-bundle
    Bridge-token-authed endpoint that returns the TLS cert + key for
    local.draftai.us, plus the Supabase URL and anon key (public, needed for
    bridge-side DB writes). Required by C2 (bridge HTTP server).
    Auth: bridge token in Authorization header. NEVER served unauthenticated.

— GET /bridge/integration-tokens
    Bridge-token-authed endpoint that returns all connected integration tokens
    for the user as env-var-ready key/value pairs. Called once at bridge startup.
    Auth: bridge token in Authorization header.

— WS /bridge/ws?token=<bridge_token>
    The local bridge daemon opens a persistent WebSocket here. Incoming Slack
    events are forwarded over this connection instead of going to RQ, while the
    bridge is connected. Bridge authenticates by presenting its token as a
    query param on the upgrade request.
"""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.api.deps import auth_protect_route
from app.bridge import registry
from app.config import settings
from app.db.bridge_tokens import create_bridge_token, revoke_bridge_tokens, validate_bridge_token
from app.db.supabase_client import get_supabase
from app.integrations.manager import get_valid_token
from app.messaging.slack.client import post_message
from app.messaging.slack.installation_store import get_installation_by_user_id

logger = logging.getLogger(__name__)

# Maps integration provider names → env var names injected into Claude Code process
_PROVIDER_ENV_VAR = {
    "linear": "LINEAR_API_KEY",
    "github": "GITHUB_TOKEN",
    "google": "GOOGLE_ACCESS_TOKEN",
    "notion": "NOTION_API_KEY",
    "slack": "SLACK_BOT_TOKEN",
    "posthog": "POSTHOG_API_KEY",
}

router = APIRouter(prefix="/bridge")

_PING_INTERVAL = 30  # seconds


# ── Bridge token issuance ─────────────────────────────────────────────────

@router.post("/token")
async def issue_bridge_token(user_id: str = Depends(auth_protect_route)):
    """Issue a long-lived bridge token for the authenticated user."""
    raw_token = create_bridge_token(user_id)
    return {"token": raw_token}


@router.delete("/token")
async def revoke_bridge_token(user_id: str = Depends(auth_protect_route)):
    """Revoke all active bridge tokens for the authenticated user."""
    revoke_bridge_tokens(user_id)
    return {"ok": True}


# ── TLS bundle ──────────────────────────────────────────────────────────

@router.get("/tls-bundle")
async def get_tls_bundle(authorization: str = Header(...)):
    """Return the TLS cert + key for local.draftai.us.

    Called by the bridge at startup (C2) so it can serve HTTPS on port 7349.
    Auth: bridge token in Authorization header ("Bearer <bridge_token>").
    The private key must never be served unauthenticated.
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bridge token")
    raw_token = authorization.removeprefix("Bearer ")
    user_id = validate_bridge_token(raw_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or revoked bridge token")

    if not settings.bridge_tls_cert or not settings.bridge_tls_key:
        raise HTTPException(status_code=503, detail="TLS bundle not configured on server")

    return {
        "cert": settings.bridge_tls_cert,
        "key": settings.bridge_tls_key,
        # Supabase publishable key is public — bridge needs it to make RLS-scoped DB writes
        "supabase_url": settings.supabase_url,
        "supabase_publishable_key": settings.supabase_publishable_key,
    }


# ── Integration tokens ────────────────────────────────────────────────────────

@router.get("/integration-tokens")
async def get_integration_tokens(authorization: str = Header(...)):
    """Return all connected integration tokens for the user as env-var key/value pairs.

    Called once by the bridge at startup. The result is cached in memory and injected
    as env vars into every Claude Code subprocess.

    Auth: bridge token in Authorization header ("Bearer <bridge_token>").
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bridge token")
    raw_token = authorization.removeprefix("Bearer ")
    user_id = validate_bridge_token(raw_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or revoked bridge token")

    supabase = get_supabase()

    # Fetch all connected integrations for this user
    rows = (
        supabase.table("integrations")
        .select("provider")
        .eq("user_id", user_id)
        .execute()
    ).data or []

    connected_providers = [row["provider"] for row in rows]
    tokens: dict[str, str] = {}

    for provider in connected_providers:
        env_var = _PROVIDER_ENV_VAR.get(provider)
        if not env_var:
            continue
        try:
            token = await get_valid_token(supabase, user_id=user_id, provider=provider)
            tokens[env_var] = token
        except Exception:
            # Skip unavailable integrations — don't fail the whole startup
            logger.warning("Could not fetch token for provider %r, skipping.", provider)

    return tokens


# ── User profile (for bridge startup context seeding) ────────────────────

@router.get("/profile")
async def get_bridge_profile(authorization: str = Header(...)):
    """Return the user's onboarding profile for workspace context seeding.

    Called by the bridge at startup to seed ~/.draft/workspace/context/ files
    if they are empty. Only returns fields needed for context files.
    Auth: bridge token in Authorization header ("Bearer <bridge_token>").
    """
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bridge token")
    raw_token = authorization.removeprefix("Bearer ")
    user_id = validate_bridge_token(raw_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or revoked bridge token")

    supabase = get_supabase()
    row = (
        supabase.table("users")
        .select("full_name, role, company_url, onboarding_scrape_observations, onboarding_scrape_correction, current_focus, daily_activities")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found")
    return row.data


# ── WebSocket relay ───────────────────────────────────────────────────────

@router.websocket("/ws")
async def bridge_ws_relay(websocket: WebSocket, token: str):
    """Persistent WebSocket connection for the local bridge daemon.

    Auth: bridge token passed as ?token= query param on the WS upgrade.

    Message format (cloud → bridge):
        {"type": "slack_event", "payload": <slack_event_dict>, "installation_id": "<uuid>"}
        {"type": "ping"}

    The bridge should respond to pings with {"type": "pong"} and reconnect
    with exponential backoff if the connection drops.
    """
    user_id = validate_bridge_token(token)
    if not user_id:
        await websocket.close(code=4001, reason="Invalid or revoked bridge token")
        return

    await websocket.accept()
    registry.register(user_id, websocket)

    ping_task = asyncio.create_task(_ping_loop(websocket))
    try:
        # Drain inbound messages (bridge acks / pongs) — no-op for now
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            if msg.get("type") == "slack_response":
                p = msg.get("payload", {})
                channel = p.get("channel")
                text = p.get("text")
                thread_ts = p.get("thread_ts")
                if channel and text:
                    installation = get_installation_by_user_id(user_id)
                    if installation:
                        asyncio.create_task(
                            post_message(installation.bot_token, channel, text, thread_ts=thread_ts)
                        )
            # pong and unknown types are silently ignored
    except WebSocketDisconnect:
        pass
    finally:
        ping_task.cancel()
        registry.deregister(user_id)


async def _ping_loop(ws: WebSocket) -> None:
    try:
        while True:
            await asyncio.sleep(_PING_INTERVAL)
            if ws.client_state == WebSocketState.CONNECTED:
                await ws.send_text(json.dumps({"type": "ping"}))
    except Exception:
        pass
