"""Lightweight PostHog wrapper for server-side event capture.

Uses fire-and-forget semantics — analytics must never block or break business logic.
Call posthog_client.shutdown() in your app lifespan to flush buffered events on exit.
"""

import posthog as _posthog

from app.config import settings

_api_key = getattr(settings, "posthog_api_key", "")
_enabled = bool(_api_key)

if _enabled:
    _posthog.project_api_key = _api_key
    _posthog.host = getattr(settings, "posthog_host", "https://us.i.posthog.com")
    # Disable the default retry/flush thread noise in logs
    _posthog.disabled = False


_init()


def capture(distinct_id: str, event: str, properties: dict | None = None) -> None:
    """Capture a PostHog event. Silently no-ops if PostHog is not configured."""
    if not _enabled:
        return
    try:
        _posthog.capture(distinct_id, event, properties or {})
    except Exception:
        pass  # analytics must never raise


def shutdown() -> None:
    """Flush buffered events. Call this in your app lifespan before exit."""
    if _enabled:
        _posthog.shutdown()
