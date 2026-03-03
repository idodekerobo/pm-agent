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
) -> str:
    """
    Creates a new agent session tied to a project.
    Returns the new agent_session_id.
    """
    insert_payload: dict = {
        "organization_id": organization_id,
        "user_id": user_id,
        "project_id": project_id,
        "workspace_id": workspace_id,
        "session_start_platform": session_start_platform,
    }
    if external_thread_id is not None:
        insert_payload["external_thread_id"] = external_thread_id

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

    max_age_hours: when set, only return sessions whose updated_at is within
    that window. Used for DM sessions to enforce a time-based cutoff.
    """
    query = (
        supabase.table("agent_sessions")
        .select("id")
        .eq("user_id", user_id)
        .eq("session_start_platform", session_start_platform)
        .eq("external_thread_id", external_thread_id)
        .order("updated_at", desc=True)
        .limit(1)
    )
    if max_age_hours is not None:
        from datetime import datetime, timedelta, timezone
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=max_age_hours)).isoformat()
        query = query.gt("updated_at", cutoff)

    result = query.execute()
    return result.data[0]["id"] if result.data else None


def update_session_display_name(
    supabase: Client,
    *,
    session_id: str,
    user_id: str,
    display_name: str,
) -> bool:
    result = (
        supabase.table("agent_sessions")
        .update({"display_name": display_name})
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


def list_sessions_for_user(supabase: Client, *, user_id: str) -> list[AgentSession]:
    result = (
        supabase.table("agent_sessions")
        .select("*")
        .eq("user_id", user_id)
        .neq("session_start_platform", "background")
        .order("created_at", desc=True)
        .execute()
    )
    return [AgentSession.model_validate(row) for row in (result.data or [])]
