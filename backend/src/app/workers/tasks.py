"""
Context gathering tasks for provider integrations.
These functions are enqueued after successful OAuth callbacks.

RQ jobs must be synchronous functions. The worker task handles:
1. Fetching user organization
2. Creating/fetching project and agent session
3. Getting workspace and sandbox context
4. Calling the agent function with all context
5. Saving results to Supabase
"""
import asyncio
from datetime import datetime, timezone
from app.db.supabase_client import get_supabase
from app.db.projects import get_or_create_default_project
from app.db.agent_sessions import get_or_create_agent_session
from app.db.workspaces import get_workspace
from app.agents.gdrive_agent import run_gdrive_context_agent
from app.agents.linear_agent import run_linear_context_agent


def gather_google_drive_context(user_id: str, provider: str = "google"):
    """
    Enqueued after Google Drive OAuth callback.
    Fetches user context, creates agent session, and runs context gathering agent.

    Args:
        user_id: User who connected the integration
        provider: Integration provider name
    """
    import sys
    import urllib.request
    from httpx._utils import get_environment_proxies
    print("=" * 80, flush=True)
    print("STARTING GOOGLE DRIVE CONTEXT GATHERING TASK", flush=True)
    print(f"User ID: {user_id}", flush=True)
    print("WORKER ENV - getproxies:", urllib.request.getproxies(), flush=True)
    print("WORKER ENV - httpx proxies:", get_environment_proxies(), flush=True)
    print("=" * 80, flush=True)
    sys.stdout.flush()

    async def _run():
        supabase = get_supabase()
        
        user_response = (
            supabase.table("users")
            .select("organization_id")
            .eq("id", user_id)
            .single()
            .execute()
        )
        
        if not user_response.data:
            raise ValueError(f"User {user_id} not found")
        
        organization_id = user_response.data["organization_id"]
        
        project_id, _ = get_or_create_default_project(
            supabase,
            organization_id=organization_id,
            user_id=user_id,
        )
        
        agent_session_id, workspace_id = get_or_create_agent_session(
            supabase,
            organization_id=organization_id,
            user_id=user_id,
            project_id=project_id,
            agent_session_id=None,
        )
        
        workspace_row = get_workspace(supabase, workspace_id=workspace_id)
        sandbox_id = workspace_row.get("last_sandbox_id")
        
        await run_gdrive_context_agent(
            user_id=user_id,
            organization_id=organization_id,
            workspace_id=workspace_id,
            sandbox_id=sandbox_id,
        )

        # TODO: save session tool calls and result
        
        return {
            "status": "success",
            "user_id": user_id,
            "provider": provider,
            "context_gathered_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error gathering Google Drive context for user {user_id}: {str(e)}")
        raise


def gather_linear_context(user_id: str, provider: str = "linear"):
    """
    Enqueued after Linear OAuth callback.
    Fetches user context, creates agent session, and runs context gathering agent.

    Args:
        user_id: User who connected the integration
        provider: Integration provider name
    """
    import sys
    import urllib.request
    from httpx._utils import get_environment_proxies
    print("=" * 80, flush=True)
    print("STARTING LINEAR CONTEXT GATHERING TASK", flush=True)
    print(f"User ID: {user_id}", flush=True)
    print("WORKER ENV - getproxies:", urllib.request.getproxies(), flush=True)
    print("WORKER ENV - httpx proxies:", get_environment_proxies(), flush=True)
    print("=" * 80, flush=True)
    sys.stdout.flush()

    async def _run():
        supabase = get_supabase()
        
        user_response = (
            supabase.table("users")
            .select("organization_id")
            .eq("id", user_id)
            .single()
            .execute()
        )
        
        if not user_response.data:
            raise ValueError(f"User {user_id} not found")
        
        organization_id = user_response.data["organization_id"]
        
        project_id, _ = get_or_create_default_project(
            supabase,
            organization_id=organization_id,
            user_id=user_id,
        )
        
        agent_session_id, workspace_id = get_or_create_agent_session(
            supabase,
            organization_id=organization_id,
            user_id=user_id,
            project_id=project_id,
            agent_session_id=None,
        )
        
        workspace_row = get_workspace(supabase, workspace_id=workspace_id)
        sandbox_id = workspace_row.get("last_sandbox_id")
        
        await run_linear_context_agent(
            user_id=user_id,
            organization_id=organization_id,
            workspace_id=workspace_id,
            sandbox_id=sandbox_id,
        )

        # TODO: save session tool calls and result
        
        return {
            "status": "success",
            "user_id": user_id,
            "provider": provider,
            "context_gathered_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error gathering Linear context for user {user_id}: {str(e)}")
        raise

def gather_notion_context(user_id: str, provider: str = "notion"):
    """
    Fetches user context, creates agent session, and runs context gathering agent.
    
    Args:
        user_id: User who connected the integration
        provider: Integration provider name
    """
    async def _run():
        print("RUNNING NOTION CONTEXT AGENT")
        # TODO: Implement Notion context gathering agent
        
        return {
            "status": "success",
            "user_id": user_id,
            "provider": provider,
            "context_gathered_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error gathering Notion context for user {user_id}: {str(e)}")
        raise
