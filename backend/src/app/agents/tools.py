import asyncio
from typing import Any, Optional

from agents import RunContextWrapper, function_tool
from app.agents.context import AgentContext
from app.config import settings
from app.db.supabase_client import get_supabase
from app.errors import log_error
from app.integrations.manager import get_valid_token
from app.messaging.slack import dispatch_slack_action

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
    try:
        await fs_write(
            context.context.workspace_id,
            path,
            content,
            organization_id=context.context.organization_id,
            user_id=context.context.user_id,
            sandbox_id=context.context.sandbox_id,
        )
        return f"Wrote '{path}'."
    except Exception as e:
        asyncio.create_task(log_error(context.context.user_id, "agent", e, context={
            "origin": "agent_tool", "tool": "tool_fs_write", "path": path,
            "error_category": "infrastructure",
        }))
        raise

@function_tool
async def tool_fs_read(context: RunContextWrapper[AgentContext], path: str) -> str:
    """Read a file inside the agent workspace.
    Args:
      path: Relative path inside the workspace (no ..).
    """
    try:
        return await fs_read(
            context.context.workspace_id,
            path,
            organization_id=context.context.organization_id,
            user_id=context.context.user_id,
            sandbox_id=context.context.sandbox_id,
        )
    except Exception as e:
        asyncio.create_task(log_error(context.context.user_id, "agent", e, context={
            "origin": "agent_tool", "tool": "tool_fs_read", "path": path,
            "error_category": "infrastructure",
        }))
        raise

@function_tool
async def tool_fs_list(context: RunContextWrapper[AgentContext], path: str = ".") -> list[str]:
    """List files inside the agent workspace.
    Args:
      path: Relative path inside the workspace.
    """
    try:
        return await fs_list(
            context.context.workspace_id,
            path=path,
            organization_id=context.context.organization_id,
            user_id=context.context.user_id,
            sandbox_id=context.context.sandbox_id,
        )
    except Exception as e:
        asyncio.create_task(log_error(context.context.user_id, "agent", e, context={
            "origin": "agent_tool", "tool": "tool_fs_list", "path": path,
            "error_category": "infrastructure",
        }))
        raise

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
            elif required_provider_auth == "google":
                env_vars["BEARER_TOKEN"] = token
            elif required_provider_auth == "notion":
                env_vars["BEARER_TOKEN"] = token
            elif required_provider_auth == "slack":
                env_vars["SLACK_BOT_TOKEN"] = token
            elif required_provider_auth == "github":
                env_vars["GITHUB_TOKEN"] = token

        except Exception as e:
            asyncio.create_task(log_error(context.context.user_id, "agent", e, context={
                "origin": "agent_tool", "tool": "tool_bash", "provider": required_provider_auth,
                "error_category": "infrastructure",
            }))
            return {
                "stdout": "",
                "stderr": f"Authentication failed for {required_provider_auth}: {str(e)}",
                "exit_code": 1
            }

    try:
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
    except Exception as e:
        asyncio.create_task(log_error(context.context.user_id, "agent", e, context={
            "origin": "agent_tool", "tool": "tool_bash", "command": command,
            "error_category": "infrastructure",
        }))
        raise


@function_tool
async def tool_slack(
    context: RunContextWrapper[AgentContext],
    action_type: str,
    message: Optional[str] = None,
    reply_in_thread: Optional[bool] = None,
    channel: Optional[str] = None,
    thread_ts: Optional[str] = None,
    slack_user_id: Optional[str] = None,
) -> str:
    """Execute a Slack action on behalf of the user.
    Args:
      action_type: The action to perform. One of "reply", "post_message", "post_reply", or "send_dm".
      message: Text content to send. Required for all action types.
      reply_in_thread: Only used with action_type="reply". Set True to reply inside the existing
        thread, False to post directly in the channel. Use True for in-depth or technical responses
        that benefit from threading; use False for brief or conversational replies.
      channel: Channel name (e.g. "general"). Required for post_message and post_reply.
      thread_ts: Timestamp of the parent message. Required for post_reply.
      slack_user_id: Slack user ID (e.g. "U0123ABCD"). Required for send_dm.
    Action types:
    - "reply": Respond to the current @-mention. Use reply_in_thread to control placement.
        Only omit this call entirely if no reply is needed (e.g. you silently completed an action).
    - "post_message": Proactively post a new message in a channel. Requires channel.
    - "post_reply": Proactively reply inside an existing thread. Requires channel and thread_ts.
    - "send_dm": Send a direct message to a user. Requires slack_user_id.
    Rules:
    - Use channel names (e.g. "general"), not raw Slack channel IDs, for post_message/post_reply.
    - Only post to channels the user has explicitly enabled in their settings.
    - If Slack is not connected or the channel is inaccessible, explain this to the user and stop.
    - Do not post to Slack proactively unless the user has explicitly asked you to.
    - If the user has multiple Slack workspaces connected and hasn't specified which one to use,
      ask them which workspace to post to before proceeding.
    """
    try:
        return await dispatch_slack_action(
            ctx=context.context,
            action_type=action_type,
            message=message,
            reply_in_thread=reply_in_thread,
            channel=channel,
            thread_ts=thread_ts,
            slack_user_id=slack_user_id,
        )
    except Exception as e:
        asyncio.create_task(log_error(context.context.user_id, "agent", e, context={
            "origin": "agent_tool", "tool": "tool_slack", "action_type": action_type,
            "error_category": "infrastructure",
        }))
        raise