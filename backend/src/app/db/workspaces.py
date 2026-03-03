"""
Database helpers for managing workspace metadata (Modal volumes, sandbox IDs, etc).
"""
import asyncio
from supabase import Client
from app.schemas.workspace import Workspace


def get_workspace(supabase: Client, *, workspace_id: str) -> Workspace:
    """
    Retrieve workspace metadata by ID.
    
    Args:
        supabase: Supabase client
        workspace_id: Workspace identifier
        
    Returns:
        Workspace model with fields: id, organization_id, modal_volume_name, last_sandbox_id, sandbox_status, created_at, updated_at
    """
    result = (
        supabase.table("workspaces")
        .select("*")
        .eq("id", workspace_id)
        .single()
        .execute()
    )
    return Workspace.model_validate(result.data)


def create_workspace(
    supabase: Client,
    *,
    workspace_id: str,
    organization_id: str,
    user_id: str,
) -> Workspace:
    """
    Create a new workspace record.
    """
    result = (
        supabase.table("workspaces")
        .insert(
            {
                "id": workspace_id,
                "organization_id": organization_id,
                "user_id": user_id,
            }
        )
        .execute()
    )
    return Workspace.model_validate(result.data[0])

def set_workspace_agent_run_status(
    supabase: Client,
    *,
    workspace_id: str,
    status: str,
) -> None:
    """
    Set the agent_run_status on a workspace row.

    Call with status="running" when an agent run starts and status="idle" when it ends.
    Used by both the web /run route and the Slack dispatcher so the frontend can
    surface a warning when the agent is actively processing.
    """
    supabase.table("workspaces").update(
        {"agent_run_status": status}
    ).eq("id", workspace_id).execute()


def update_workspace_sandbox_id(
    supabase: Client,
    *,
    workspace_id: str,
    sandbox_id: str,
) -> None:
    """
    Update the last known sandbox ID and status for a workspace.
    
    Call this after creating a new sandbox so subsequent runs can reconnect to it.
    
    Args:
        supabase: Supabase client
        workspace_id: Workspace identifier
        sandbox_id: Modal sandbox object_id to persist
    """
    supabase.table("workspaces").update(
        {
            "last_sandbox_id": sandbox_id,
            "sandbox_status": "running",
        }
    ).eq("id", workspace_id).execute()


def update_workspace_sandbox_status(
    supabase: Client,
    *,
    workspace_id: str,
    status: str,
) -> None:
    """
    Fire-and-forget update of sandbox_status for a workspace.

    Schedules the DB write in a background thread and returns immediately —
    the caller is never blocked waiting for it.

    Args:
        supabase: Supabase client
        workspace_id: Workspace identifier
        status: New status string (e.g. "stopped", "running")
    """
    asyncio.create_task(
        asyncio.to_thread(
            lambda: supabase.table("workspaces")
            .update({"sandbox_status": status})
            .eq("id", workspace_id)
            .execute()
        )
    )
