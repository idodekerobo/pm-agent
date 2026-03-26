"""DB helpers for bridge_tokens table."""

import hashlib
import secrets
from datetime import datetime, timezone

from app.db.supabase_client import get_supabase


def _hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def create_bridge_token(user_id: str) -> str:
    """Issue a new bridge token for the user. Returns the raw token (only time it's visible)."""
    supabase = get_supabase()
    raw = secrets.token_hex(32)
    supabase.table("bridge_tokens").insert({
        "user_id": user_id,
        "token_hash": _hash(raw),
    }).execute()
    return raw


def validate_bridge_token(raw_token: str) -> str | None:
    """Validate a raw bridge token. Returns user_id or None if invalid/revoked."""
    supabase = get_supabase()
    result = (
        supabase.table("bridge_tokens")
        .select("id, user_id, revoked")
        .eq("token_hash", _hash(raw_token))
        .maybe_single()
        .execute()
    )
    if not result.data or result.data["revoked"]:
        return None
    supabase.table("bridge_tokens").update({
        "last_used_at": datetime.now(timezone.utc).isoformat()
    }).eq("token_hash", _hash(raw_token)).execute()
    return result.data["user_id"]


def revoke_bridge_tokens(user_id: str) -> None:
    """Revoke all active bridge tokens for a user."""
    supabase = get_supabase()
    supabase.table("bridge_tokens").update({"revoked": True}).eq("user_id", user_id).eq("revoked", False).execute()
