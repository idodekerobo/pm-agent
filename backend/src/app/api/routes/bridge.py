"""Bridge auth (A1) and WebSocket relay (A2) endpoints.

A1 — POST /bridge/token
    Supabase-authed user requests a long-lived bridge token, stored as SHA-256
    hash in bridge_tokens table. Raw token returned once; bridge stores in OS
    keychain. DELETE /bridge/token revokes all active tokens for the user.

A2 — WS /bridge/ws?token=<bridge_token>
    The local bridge daemon opens a persistent WebSocket here. Incoming Slack
    events are forwarded over this connection instead of going to RQ, while the
    bridge is connected. Bridge authenticates by presenting its token as a
    query param on the upgrade request.
"""

import asyncio
import json

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.api.deps import auth_protect_route
from app.bridge import registry
from app.db.bridge_tokens import create_bridge_token, revoke_bridge_tokens, validate_bridge_token

router = APIRouter(prefix="/bridge")

_PING_INTERVAL = 30  # seconds


# ── A1: Bridge token issuance ─────────────────────────────────────────────────

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


# ── A2: WebSocket relay ───────────────────────────────────────────────────────

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
