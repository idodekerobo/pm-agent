from supabase import Client

def get_or_create_agent_session(
    supabase: Client,
    *,
    organization_id: str,
    user_id: str,
    project_id: str,
    agent_session_id: str | None,
) -> tuple[str, str]:
    """
    Gets or creates an agent session tied to a project.
    The workspace_id comes from the project, not the session.
    Returns (agent_session_id, workspace_id)
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

    # 3. If no session ID, create a NEW session tied to this project
    new_session = (
        supabase.table("agent_sessions")
        .insert(
            {
                "organization_id": organization_id,
                "user_id": user_id,
                "project_id": project_id,
                "workspace_id": workspace_id,
            }
        )
        .execute()
    )
    created_session = new_session.data[0]
    return created_session["id"], created_session["workspace_id"]