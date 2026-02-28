from dataclasses import dataclass


@dataclass
class AgentContext:
    organization_id: str
    user_id: str
    workspace_id: str
    sandbox_id: str | None = None
    # Populated when the agent is running in response to a Slack @-mention.
    # Contains: channel_id, ts, thread_ts (None if top-level), is_in_thread (bool)
    slack_mention_context: dict | None = None
    # Flipped to True by dispatcher.py when the agent calls tool_slack action_type="reply"
    slack_mention_replied: bool = False


@dataclass
class AgentRunPayload:
    organization_id: str
    user_id: str
    agent_session_id: str
    workspace_id: str
    sandbox_id: str | None
    agent_context: AgentContext


def build_agent_run_payload(
    supabase,
    user_id: str,
    *,
    agent_session_id: str | None = None,
    slack_mention_context: dict | None = None,
    session_start_platform: str = "web",
    external_thread_id: str | None = None,
) -> AgentRunPayload:
    """Resolve all IDs and build the context needed to invoke any agent.

    Fetches organization, creates/fetches the default project and agent session,
    resolves the workspace and sandbox, and constructs an AgentContext. Pass the
    result directly into run_orchestrator, run_gdrive_context_agent, etc.

    Args:
        supabase: An active Supabase client (caller-owned so it can be reused).
        user_id: The authenticated user triggering the agent run.
        agent_session_id: Resume an existing session instead of creating a new one.
        slack_mention_context: Populate AgentContext.slack_mention_context for
            @-mention flows so the agent knows how to route its reply via tool_slack.
    """
    from app.db.agent_sessions import get_or_create_agent_session
    from app.db.projects import get_or_create_default_project
    from app.db.workspaces import get_workspace

    user_row = (
        supabase.table("users")
        .select("organization_id")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not user_row.data:
        raise ValueError(f"User {user_id} not found in DB")

    organization_id = user_row.data.get("organization_id") or "local"

    project_id, _ = get_or_create_default_project(
        supabase,
        organization_id=organization_id,
        user_id=user_id,
    )

    resolved_session_id, workspace_id = get_or_create_agent_session(
        supabase,
        organization_id=organization_id,
        user_id=user_id,
        project_id=project_id,
        agent_session_id=agent_session_id,
        session_start_platform=session_start_platform,
        external_thread_id=external_thread_id,
    )

    workspace_row = get_workspace(supabase, workspace_id=workspace_id)
    sandbox_id = workspace_row.get("last_sandbox_id")

    agent_context = AgentContext(
        organization_id=organization_id,
        user_id=user_id,
        workspace_id=workspace_id,
        sandbox_id=sandbox_id,
        slack_mention_context=slack_mention_context,
    )

    return AgentRunPayload(
        organization_id=organization_id,
        user_id=user_id,
        agent_session_id=resolved_session_id,
        workspace_id=workspace_id,
        sandbox_id=sandbox_id,
        agent_context=agent_context,
    )
