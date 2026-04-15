from supabase import Client
from app.schemas.agent_session import AgentSession


def create_agent_session(
    supabase: Client,
    *,
    organization_id: str,
    user_id: str,
    project_id: str,
    workspace_id: str,
    session_start_platform: str = "web",
    external_thread_id: str | None = None,
    is_pinned: bool = False,
    initiated_by: str = "user",
    display_name: str | None = None,
    session_id: str | None = None,
    execution_environment: str = "cloud",
    provider: str = "openai",
    provider_session_id: str | None = None,
    workspace_path: str | None = None,
) -> str:
    """
    Creates a new agent session tied to a project.
    Returns the new agent_session_id.
    """
    from datetime import datetime, timezone
    insert_payload: dict = {
        "organization_id": organization_id,
        "user_id": user_id,
        "project_id": project_id,
        "workspace_id": workspace_id,
        "session_start_platform": session_start_platform,
        "is_pinned": is_pinned,
        "initiated_by": initiated_by,
        "last_read_at": datetime.now(timezone.utc).isoformat(),
        "execution_environment": execution_environment,
        "provider": provider,
    }
    if provider_session_id is not None:
        insert_payload["provider_session_id"] = provider_session_id
    if session_id is not None:
        insert_payload["id"] = session_id
    if display_name is not None:
        insert_payload["display_name"] = display_name
    if external_thread_id is not None:
        insert_payload["external_thread_id"] = external_thread_id
    if workspace_path is not None:
        insert_payload["workspace_path"] = workspace_path

    new_session = (
        supabase.table("agent_sessions")
        .insert(insert_payload)
        .execute()
    )
    return new_session.data[0]["id"]


def find_session_by_thread_id(
    supabase: Client,
    *,
    user_id: str,
    session_start_platform: str,
    external_thread_id: str,
    max_age_hours: int | None = None,
) -> str | None:
    """
    Look up an existing agent_session by its external thread key.
    Returns the session id if found, None otherwise.

    max_age_hours: when set, only return sessions whose last_message_at is within
    that window. Used for DM sessions to enforce a time-based cutoff.
    """
    query = (
        supabase.table("agent_sessions")
        .select("id")
        .eq("user_id", user_id)
        .eq("session_start_platform", session_start_platform)
        .eq("external_thread_id", external_thread_id)
        .order("last_message_at", desc=True)
        .limit(1)
    )
    if max_age_hours is not None:
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=max_age_hours)).isoformat()
        query = query.gt("last_message_at", cutoff)

    result = query.execute()
    return result.data[0]["id"] if result.data else None


_PATCHABLE_SESSION_FIELDS = {"display_name", "is_pinned", "workspace_path"}


def update_session_fields(
    supabase: Client,
    *,
    session_id: str,
    user_id: str,
    fields: dict,
) -> bool:
    """Update whitelisted fields on an agent session. Returns True if a row was updated."""
    safe = {k: v for k, v in fields.items() if k in _PATCHABLE_SESSION_FIELDS}
    if not safe:
        return True
    result = (
        supabase.table("agent_sessions")
        .update(safe)
        .eq("id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(result.data)


def delete_session(
    supabase: Client,
    *,
    session_id: str,
    user_id: str,
) -> bool:
    result = (
        supabase.table("agent_sessions")
        .delete()
        .eq("id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(result.data)


def get_recent_summaries(supabase: Client, *, user_id: str, limit: int = 5) -> list[dict]:
    """Return the most recent summarized sessions for a user.

    Used to inject past conversation context into the agent's system prompt.
    Only returns sessions that have a non-null summary.
    """
    result = (
        supabase.table("agent_sessions")
        .select("id, display_name, summary, last_message_at")
        .eq("user_id", user_id)
        .not_.is_("summary", "null")
        .order("last_message_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data or []


def list_sessions_for_user(supabase: Client, *, user_id: str) -> list[AgentSession]:
    result = (
        supabase.table("agent_sessions")
        .select("*")
        .eq("user_id", user_id)
        .neq("session_start_platform", "background")
        .order("is_pinned", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    return [AgentSession.model_validate(row) for row in (result.data or [])]


def mark_session_read(supabase: Client, *, session_id: str, user_id: str) -> bool:
    """Set last_read_at = now() for the session. Returns True if a row was updated."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("agent_sessions")
        .update({"last_read_at": now})
        .eq("id", session_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(result.data)



