"""Lightweight PostHog wrapper for server-side event capture.

Uses fire-and-forget semantics — analytics must never block or break business logic.
Call posthog_client.shutdown() in your app lifespan to flush buffered events on exit.
"""

import logging

from posthog import Posthog

from app.config import settings

_is_dev = settings.app_environment == "development"
logging.getLogger("posthog").setLevel(logging.DEBUG if _is_dev else logging.WARNING)

_api_key = getattr(settings, "posthog_api_key", "")
_enabled = bool(_api_key)

_client: Posthog | None = None
if _enabled:
    _client = Posthog(
        project_api_key=_api_key,
        host=getattr(settings, "posthog_host", "https://us.i.posthog.com"),
        debug=_is_dev,
    )


def capture(distinct_id: str, event: str, properties: dict | None = None) -> None:
    """Capture a PostHog event. Silently no-ops if PostHog is not configured."""
    if not _enabled or _client is None:
        return
    try:
        _client.capture(distinct_id, event, properties or {})
    except Exception:
        pass  # analytics must never raise


def shutdown() -> None:
    """Flush buffered events. Call this in your app lifespan before exit."""
    if _enabled and _client is not None:
        _client.shutdown()
