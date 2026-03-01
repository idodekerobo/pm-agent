from supabase import Client
from app.schemas.agent_session import AgentSession


def get_or_create_agent_session(
    supabase: Client,
    *,
    organization_id: str,
    user_id: str,
    project_id: str,
    agent_session_id: str | None,
    session_start_platform: str = "web",
    external_thread_id: str | None = None,
) -> tuple[str, str]:
    """
    Gets or creates an agent session tied to a project.
    The workspace_id comes from the project, not the session.
    Returns (agent_session_id, workspace_id)

    session_start_platform and external_thread_id are only used when creating a new
    session — they are ignored on the resume (agent_session_id provided) path.
    """

    project_res = (
        supabase.table("projects")
        .select("workspace_id")
        .eq("id", project_id)
        .single()
        .execute()
    )
    workspace_id = project_res.data["workspace_id"]

    if agent_session_id:
        return agent_session_id, workspace_id

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
    created_session = new_session.data[0]
    return created_session["id"], created_session["workspace_id"]


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


def list_sessions_for_user(supabase: Client, *, user_id: str) -> list[AgentSession]:
    result = (
        supabase.table("agent_sessions")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [AgentSession.model_validate(row) for row in (result.data or [])]
