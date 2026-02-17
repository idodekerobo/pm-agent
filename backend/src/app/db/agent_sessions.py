from uuid import uuid4
from supabase import Client

def get_or_create_agent_session(
    supabase: Client,
    *,
    organization_id: str,
    user_id: str,
    agent_session_id: str | None,
) -> tuple[str, str]:
    if agent_session_id:
        response = (
            supabase.table("agent_sessions")
            .select("agent_session_id, workspace_id")
            .eq("id", agent_session_id)
            .maybe_single()
            .execute()
        )
        row = response.data
        if row:
            workspace_id = row["workspace_id"] or str(uuid4())
            if row["workspace_id"] is None:
                (
                    supabase.table("agent_sessions")
                    .update({"workspace_id": workspace_id})
                    .eq("id", agent_session_id)
                    .execute()
                )
            return row["id"], workspace_id
    
    new_workspace_id = str(uuid4())
    new_session = (
        supabase.table("agent_sessions")
        .insert({"organization_id": organization_id, "user_id": user_id, "workspace_id": new_workspace_id})
        .execute()
    )
    created_session = new_session.data[0]
    return created_session["id"], created_session["workspace_id"]