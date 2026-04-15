"""Outgoing WebSocket connection to Draft Cloud for Slack event relay (C5).

Architecture (Phase 1, Option A):
  1. On startup, bridge connects to wss://api.draftai.us/bridge/ws?token=<bridge_token>
  2. Cloud forwards Slack events over this connection (instead of routing to RQ)
  3. Bridge spawns Claude Code in a background task for each Slack event
  4. Bridge sends the response back to cloud via the same WebSocket
  5. Cloud posts the response to Slack using existing Slack SDK logic

Reconnection: exponential backoff (1s → 2s → 4s … cap 60s). Resets on
successful connection.

Phase 2 option (TODOS.md): bridge fetches Slack bot token from integration cache
and posts directly to Slack API, removing the cloud round-trip.
"""

import asyncio
import json
import logging

from draft_bridge.constants import CLOUD_WS_URL

logger = logging.getLogger(__name__)

_BACKOFF_INITIAL = 1.0
_BACKOFF_MAX = 60.0
_BACKOFF_FACTOR = 2.0


async def run_relay(bridge_token: str, on_slack_event) -> None:
    """Maintain a persistent outgoing WebSocket to Draft Cloud.

    Args:
        bridge_token: Raw bridge token from OS keychain.
        on_slack_event: Async callable(ws, payload) invoked for each Slack event.
                        ``ws`` is the live WebSocket — use it to send responses back.
    """
    import websockets  # imported lazily so missing dep gives a clear error at startup

    url = f"{CLOUD_WS_URL}?token={bridge_token}"
    backoff = _BACKOFF_INITIAL

    while True:
        try:
            async with websockets.connect(url, ping_interval=None) as ws:
                backoff = _BACKOFF_INITIAL  # reset on successful connect
                logger.info("Slack relay connected to Draft Cloud.")

                async for raw in ws:
                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        logger.warning("Slack relay: received non-JSON message, ignoring.")
                        continue

                    msg_type = msg.get("type")

                    if msg_type == "ping":
                        await ws.send(json.dumps({"type": "pong"}))

                    elif msg_type == "slack_event":
                        # Fire and forget — don't block the relay loop waiting for Claude
                        asyncio.create_task(
                            _safe_handle(on_slack_event, ws, msg.get("payload", {}))
                        )

                    else:
                        logger.debug("Slack relay: unknown message type %r, ignoring.", msg_type)

        except asyncio.CancelledError:
            logger.info("Slack relay shutting down.")
            return

        except Exception as exc:
            logger.warning(
                "Slack relay disconnected (%s). Reconnecting in %.0fs...", exc, backoff
            )
            await asyncio.sleep(backoff)
            backoff = min(backoff * _BACKOFF_FACTOR, _BACKOFF_MAX)


async def _safe_handle(handler, ws, payload: dict) -> None:
    """Wrap the event handler so an exception in one event never crashes the relay loop."""
    try:
        await handler(ws, payload)
    except Exception as exc:
        logger.error("Slack event handler raised an exception: %s", exc, exc_info=True)
