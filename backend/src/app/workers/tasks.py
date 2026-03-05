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
from app.agents.context import build_agent_run_payload
from app.agents.researcher_agent import (
    run_research_and_learn,
    GDRIVE_CONTEXT_PROMPT,
    LINEAR_CONTEXT_PROMPT,
)


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
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")

        await run_research_and_learn(payload, GDRIVE_CONTEXT_PROMPT)

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
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")

        await run_research_and_learn(payload, LINEAR_CONTEXT_PROMPT)

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

def handle_slack_message(event_payload: dict, installation_id: str):
    """
    Process an incoming Slack event (app_mention or DM) and post a reply.

    Enqueued by POST /slack/events immediately after the 200 ACK so Slack's
    3-second response window is never at risk.

    Args:
        event_payload: The full Slack Events API payload dict.
        installation_id: UUID of the slack_installations row for this workspace.
    """
    import sys
    event_type = event_payload.get("event", {}).get("type")
    print("=" * 80, flush=True)
    print("\n")
    print("SLACK EVENT — handle_slack_message", flush=True)
    print(f"installation_id: {installation_id}", flush=True)
    print(f"event type: {event_type}", flush=True)
    print("event payload:")
    print(event_payload)
    print("\n")
    print("=" * 80, flush=True)
    sys.stdout.flush()

    async def _run():
        from app.messaging.slack import get_installation_by_id, dispatch_event

        installation = get_installation_by_id(installation_id)
        if not installation:
            print(f"[slack] installation {installation_id} not found — skipping", flush=True)
            return

        await dispatch_event(event_payload, installation)

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"[slack] error in handle_slack_message: {e}", flush=True)
        raise


def provision_skill(user_id: str, provider: str):
    """Write skill files for the given provider into the user's workspace volume.

    Enqueued after a successful OAuth callback so the agent has skill docs
    available on its next run without needing to provision them each time.
    """
    async def _run():
        from app.agents.context import resolve_workspace_context, provision_skills_for_provider
        supabase = get_supabase()
        organization_id, _project_id, workspace_id, sandbox_id = resolve_workspace_context(supabase, user_id)
        await provision_skills_for_provider(
            workspace_id=workspace_id,
            organization_id=organization_id,
            user_id=user_id,
            sandbox_id=sandbox_id,
            provider=provider,
        )

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error provisioning skill for provider={provider} user={user_id}: {e}")
        raise


def deprovision_skill(user_id: str, provider: str):
    """Remove skill files for the given provider from the user's workspace volume.

    Enqueued when the user disconnects an integration.
    """
    async def _run():
        from app.agents.context import resolve_workspace_context, deprovision_skills_for_provider
        supabase = get_supabase()
        organization_id, _project_id, workspace_id, sandbox_id = resolve_workspace_context(supabase, user_id)
        await deprovision_skills_for_provider(
            workspace_id=workspace_id,
            organization_id=organization_id,
            user_id=user_id,
            sandbox_id=sandbox_id,
            provider=provider,
        )

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error deprovisioning skill for provider={provider} user={user_id}: {e}")
        raise


def gather_github_context(user_id: str, provider: str = "github"):
    """
    Enqueued after GitHub OAuth callback.
    Fetches user context, creates agent session, and runs context gathering agent.
    """
    async def _run():
        from app.agents.researcher_agent import run_research_and_learn, GITHUB_CONTEXT_PROMPT
        supabase = get_supabase()
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")
        await run_research_and_learn(payload, GITHUB_CONTEXT_PROMPT)
        return {
            "status": "success",
            "user_id": user_id,
            "provider": provider,
            "context_gathered_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error gathering GitHub context for user {user_id}: {str(e)}")
        raise


def gather_notion_context(user_id: str, provider: str = "notion"):
    """
    Enqueued after Notion OAuth callback.
    Fetches user context, creates agent session, and runs context gathering agent.
    """
    async def _run():
        from app.agents.researcher_agent import run_research_and_learn, NOTION_CONTEXT_PROMPT
        supabase = get_supabase()
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")
        await run_research_and_learn(payload, NOTION_CONTEXT_PROMPT)
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
