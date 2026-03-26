"""In-memory registry of active bridge WebSocket connections.

Keyed by user_id. Single-process only — acceptable for Phase 1 (3 test users).
"""

from fastapi import WebSocket

_registry: dict[str, WebSocket] = {}


def register(user_id: str, ws: WebSocket) -> None:
    _registry[user_id] = ws


def deregister(user_id: str) -> None:
    _registry.pop(user_id, None)


def get(user_id: str) -> WebSocket | None:
    return _registry.get(user_id)


def is_connected(user_id: str) -> bool:
    return user_id in _registry
