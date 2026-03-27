"""Bridge auth, TLS bundle, and WebSocket relay endpoints.

— POST /bridge/token
    Supabase-authed user requests a long-lived bridge token, stored as SHA-256
    hash in bridge_tokens table. Raw token returned once; bridge stores in OS
    keychain. DELETE /bridge/token revokes all active tokens for the user.

— GET /bridge/tls-bundle
    Bridge-token-authed endpoint that returns the TLS cert + key for
    local.draftai.us. Required by C2 (bridge HTTP server) so it can serve HTTPS.
    Auth: bridge token in Authorization header. NEVER served unauthenticated.

— WS /bridge/ws?token=<bridge_token>
    The local bridge daemon opens a persistent WebSocket here. Incoming Slack
    events are forwarded over this connection instead of going to RQ, while the
    bridge is connected. Bridge authenticates by presenting its token as a
    query param on the upgrade request.
"""

import asyncio
import json

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.api.deps import auth_protect_route
from app.bridge import registry
from app.config import settings
from app.db.bridge_tokens import create_bridge_token, revoke_bridge_tokens, validate_bridge_token

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

    return {"cert": settings.bridge_tls_cert, "key": settings.bridge_tls_key}


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
            await websocket.receive_text()
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
