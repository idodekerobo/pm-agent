from supabase import Client
from app.schemas.code_task import CodeTask


def create_code_task(
    supabase: Client,
    *,
    agent_session_id: str,
    user_id: str,
    workspace_id: str,
    repo_url: str,
    base_branch: str,
    spec: str,
) -> str:
    """Insert a new code task row and return its generated id."""
    result = (
        supabase.table("code_tasks")
        .insert({
            "agent_session_id": agent_session_id,
            "user_id": user_id,
            "workspace_id": workspace_id,
            "repo_url": repo_url,
            "base_branch": base_branch,
            "spec": spec,
        })
        .execute()
    )
    return result.data[0]["id"]


def update_code_task(supabase: Client, *, task_id: str, **kwargs) -> None:
    """Partial update of a code task row by id."""
    supabase.table("code_tasks").update(kwargs).eq("id", task_id).execute()


def get_code_task(supabase: Client, *, task_id: str) -> CodeTask:
    result = (
        supabase.table("code_tasks")
        .select("*")
        .eq("id", task_id)
        .single()
        .execute()
    )
    return CodeTask.model_validate(result.data)
