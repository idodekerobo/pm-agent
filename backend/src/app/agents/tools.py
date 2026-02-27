from typing import Any, Optional

from agents import RunContextWrapper, function_tool
from app.agents.context import AgentContext
from app.config import settings
from app.db.supabase_client import get_supabase
from app.integrations.manager import get_valid_token
from app.messaging.slack.dispatcher import dispatch_slack_action

if settings.workspace_backend == "production":
    from app.workspace.workspace_runtime import bash as ws_bash
    from app.workspace.workspace_runtime import fs_read, fs_list, fs_write
else:
    from app.workspace.local_workspace_runtime import bash as ws_bash
    from app.workspace.local_workspace_runtime import fs_read, fs_list, fs_write

@function_tool
async def tool_fs_write(context: RunContextWrapper[AgentContext], path: str, content: str) -> str:
    """
    Write a file inside the agent workspace.
    Args:
        path: Relaive path inside the workspace (no ..).
        content: File contents.
    """
    await fs_write(
        context.context.workspace_id,
        path,
        content,
        organization_id=context.context.organization_id,
        user_id=context.context.user_id,
        sandbox_id=context.context.sandbox_id,
    )
    return f"Wrote '{path}'."

@function_tool
async def tool_fs_read(context: RunContextWrapper[AgentContext], path: str) -> str:
    """Read a file inside the agent workspace.
    Args:
      path: Relative path inside the workspace (no ..).
    """
    return await fs_read(
        context.context.workspace_id,
        path,
        organization_id=context.context.organization_id,
        user_id=context.context.user_id,
        sandbox_id=context.context.sandbox_id,
    )

@function_tool
async def tool_fs_list(context: RunContextWrapper[AgentContext], path: str = ".") -> list[str]:
    """List files inside the agent workspace.
    Args:
      path: Relative path inside the workspace.
    """
    return await fs_list(
        context.context.workspace_id,
        path=path,
        organization_id=context.context.organization_id,
        user_id=context.context.user_id,
        sandbox_id=context.context.sandbox_id,
    )

@function_tool
async def tool_bash(
    context: RunContextWrapper[AgentContext],
    command: str,
    cwd: str = ".",
    timeout_s: int = 60,
    required_provider_auth: Optional[str] = None,
) -> dict[str, Any]:
    """Run a bash command inside the agent workspace.
    Args:
      command: Shell command to run.
      cwd: Relative working directory inside the workspace.
      timeout_s: Timeout in seconds.
      required_provider_auth: Optional provider name (e.g. "linear", "google", etc.) to inject authentication for.
    """

    env_vars = {}
    header_string: str | None = None
    if required_provider_auth:
        supabase = get_supabase()
        try:
            token = await get_valid_token(
                supabase,
                user_id=context.context.user_id,
                provider=required_provider_auth,
            )
            if required_provider_auth == "linear":
                # Prepend Bearer for OAuth tokens, which is what we're using
                env_vars["LINEAR_API_KEY"] = f"Bearer {token}"
            if required_provider_auth == "google":
                env_vars["BEARER_TOKEN"] = token

        except Exception as e:
            return {
                "stdout": "",
                "stderr": f"Authentication failed for {required_provider_auth}: {str(e)}", 
                "exit_code": 1
            }

    result = await ws_bash(
        context.context.workspace_id,
        command=command,
        cwd=cwd,
        timeout_s=timeout_s,
        organization_id=context.context.organization_id, # TODO: do i need this?? 
        user_id=context.context.user_id,
        sandbox_id=context.context.sandbox_id,
        env=env_vars,
        header=header_string,
    )
    return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.exit_code}


@function_tool
async def tool_slack(
    context: RunContextWrapper[AgentContext],
    action_type: str,
    channel: Optional[str] = None,
    message: Optional[str] = None,
    thread_ts: Optional[str] = None,
    slack_user_id: Optional[str] = None,
) -> str:
    """Execute a Slack action on behalf of the user.
    Args:
      action_type: The action to perform. One of "post_message", "post_reply", or "send_dm".
      channel: Channel name to post to (e.g. "general"). Required for post_message and post_reply.
      message: Text content to send. Required for all action types.
      thread_ts: Timestamp of the parent message to reply to. Required for post_reply.
      slack_user_id: Slack user ID to send a DM to (e.g. "U0123ABCD"). Required for send_dm.
    Rules:
    - Use channel names (e.g. "general"), not raw Slack channel IDs.
    - Only post to channels the user has explicitly enabled in their settings.
    - If Slack is not connected or the channel is inaccessible, explain this to the user and stop.
    - Do not post to Slack unless the user has explicitly asked you to.
    """
    return await dispatch_slack_action(
        ctx=context.context,
        action_type=action_type,
        channel=channel,
        message=message,
        thread_ts=thread_ts,
        slack_user_id=slack_user_id,
    )