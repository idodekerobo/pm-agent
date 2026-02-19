from uuid import uuid4
from supabase import Client
from app.db.workspaces import create_workspace


def get_or_create_default_project(
    supabase: Client,
    *,
    organization_id: str,
    user_id: str,
) -> tuple[str, str]:
    """
    Gets or creates a "default project" for the organization.
    Returns (project_id, workspace_id)
    """
    result = (
        supabase.table("projects")
        .select("id, workspace_id")
        .eq("organization_id", organization_id)
        .eq("name", "default project")
        .maybe_single()
        .execute()
    )

    if result and result.data:
        return result.data["id"], result.data["workspace_id"]

    project_id = str(uuid4())
    workspace_id = str(uuid4())

    create_workspace(
        supabase,
        workspace_id=workspace_id,
        organization_id=organization_id,
        user_id=user_id,
    )

    new_project = (
        supabase.table("projects")
        .insert(
            {
                "id": project_id,
                "organization_id": organization_id,
                "name": "default project",
                "workspace_id": workspace_id,
                "user_id": user_id,
            }
        )
        .execute()
    )

    return new_project.data[0]["id"], new_project.data[0]["workspace_id"]
