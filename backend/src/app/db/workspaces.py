"""
Database helpers for managing workspace metadata (Modal volumes, sandbox IDs, etc).
"""
from supabase import Client
from app.schemas.workspace import Workspace


def get_workspace(supabase: Client, *, workspace_id: str) -> Workspace:
    """
    Retrieve workspace metadata by ID.
    
    Args:
        supabase: Supabase client
        workspace_id: Workspace identifier
        
    Returns:
        Workspace record dict with keys: id, organization_id, modal_volume_name, last_sandbox_id, sandbox_status, created_at, updated_at
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
