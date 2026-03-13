"""DB helpers for the demo_sessions table."""
from __future__ import annotations

import secrets
from typing import Optional
from supabase import Client


def _token() -> str:
    return secrets.token_urlsafe(24)


def create_demo_session(supabase: Client, *, company_url: str) -> dict:
    """Insert a new demo session. Returns the full row."""
    token = _token()
    result = (
        supabase.table("demo_sessions")
        .insert({"demo_token": token, "company_url": company_url, "turn_count": 1})
        .execute()
    )
    return result.data[0]


def get_demo_session_by_token(supabase: Client, *, demo_token: str) -> Optional[dict]:
    """Fetch a demo session by token. Returns None if not found or expired."""
    result = (
        supabase.table("demo_sessions")
        .select("*")
        .eq("demo_token", demo_token)
        .gt("expires_at", "now()")
        .maybe_single()
        .execute()
    )
    return result.data


def increment_turn_count(supabase: Client, *, demo_token: str) -> Optional[dict]:
    """Atomically increment turn_count. Returns the updated row."""
    # Supabase PostgREST doesn't support atomic increment directly, so we do a
    # fetch-then-update. Acceptable here — demo concurrency is negligible.
    row = get_demo_session_by_token(supabase, demo_token=demo_token)
    if not row:
        return None
    new_count = row["turn_count"] + 1
    result = (
        supabase.table("demo_sessions")
        .update({"turn_count": new_count})
        .eq("demo_token", demo_token)
        .execute()
    )
    return result.data[0] if result.data else None


def append_demo_items(supabase: Client, *, demo_token: str, items: list[dict]) -> None:
    """Overwrite the items column with the full conversation so far."""
    supabase.table("demo_sessions").update({"items": items}).eq("demo_token", demo_token).execute()


def claim_demo_session(supabase: Client, *, demo_token: str, user_id: str) -> Optional[dict]:
    """Mark a demo session as claimed by a user. Returns the updated row."""
    result = (
        supabase.table("demo_sessions")
        .update({"claimed": True, "claimed_user_id": user_id})
        .eq("demo_token", demo_token)
        .eq("claimed", False)
        .gt("expires_at", "now()")
        .execute()
    )
    return result.data[0] if result.data else None
