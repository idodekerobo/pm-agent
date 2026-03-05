"""
Centralized error logger.

Usage (async context — API routes, agent stream):
    from app.errors.logger import log_error
    await log_error(user_id, "server", exc, context={"route": "/run"})

Usage (sync context — RQ workers):
    from app.errors.logger import log_error_sync
    log_error_sync(user_id, "worker", exc, context={"job_func": "gather_github_context"})

Rules:
- Never raises — a logging failure must never crash the caller.
- Always log at the outermost catch point for each platform to avoid double-logging.
  Platforms: 'server' | 'worker' | 'agent' | 'web_app'
"""

import asyncio
import logging
import traceback
from typing import Any

from app.db.supabase_client import get_supabase
from app.schemas.error import ErrorPlatform

logger = logging.getLogger(__name__)


async def log_error(
    user_id: str | None,
    platform: ErrorPlatform,
    error: Exception,
    context: dict[str, Any] | None = None,
) -> None:
    """Persist an error to the errors table. Safe to call from any async context."""
    try:
        tb = "".join(traceback.format_exception(type(error), error, error.__traceback__))
        supabase = get_supabase()
        supabase.table("errors").insert({
            "user_id": str(user_id) if user_id else None,
            "platform": platform,
            "error_type": type(error).__name__,
            "message": str(error),
            "stack_trace": tb or None,
            "context": context or {},
        }).execute()
    except Exception as e:
        logger.error(f"[error_logger] Failed to persist error to DB: {e}")


def log_error_sync(
    user_id: str | None,
    platform: ErrorPlatform,
    error: Exception,
    context: dict[str, Any] | None = None,
) -> None:
    """Sync wrapper for use in RQ workers (no running event loop)."""
    try:
        asyncio.run(log_error(user_id, platform, error, context))
    except Exception as e:
        logger.error(f"[error_logger] Failed to run log_error in sync context: {e}")
