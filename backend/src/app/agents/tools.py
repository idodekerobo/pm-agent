import asyncio
import re
from typing import Any, Optional

from agents import RunContextWrapper, function_tool
from app.agents.context import AgentContext
from app.config import settings
from app.db.supabase_client import get_supabase
from app.errors import log_error
from app.integrations.manager import get_valid_token
from app.messaging.slack import dispatch_slack_action


def _assert_posthog_read_only(command: str) -> None:
    """Raise if a curl command targeting posthog.com uses a mutating HTTP method.

    The query endpoint (POST /query/) is the only POST allowed — it is a read
    operation that PostHog exposes as POST for payload reasons.
    All other POST, PATCH, PUT, and DELETE requests are blocked.
    """
    if "posthog.com" not in command:
        return

    # Block explicit mutating methods unconditionally
    if re.search(r"-X\s+(PATCH|PUT|DELETE)", command):
        print(f"Blocking agent attempt at a posthog write: {command}")
        raise ValueError("PostHog writes are not permitted. Only read requests are allowed.")

    # Block POST to any endpoint other than /query/
    if re.search(r"-X\s+POST", command) and "/query/" not in command:
        print(f"Blocking agent attempt at a POST to posthog endpoint that is not /query/: {command}")
        raise ValueError("PostHog writes are not permitted. POST is only allowed to the /query/ endpoint.")

    # curl sends POST implicitly when -d/--data is present without an explicit -X.
    # Block that pattern too, unless it targets /query/.
    if re.search(r"\s(-d|--data)\s", command) and "/query/" not in command:
        print(f"Blocking agent attempt at a posthog write: {command}")
        raise ValueError("PostHog writes are not permitted. Only GET and POST /query/ are allowed.")

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

# TODO: improve this function to dynamically env_var mappings instead of if/else chain
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
            elif required_provider_auth == "posthog":
                env_vars["POSTHOG_API_KEY"] = token
                # Fetch project_id and region from integration metadata
                integration_resp = (
                    supabase.table("integrations")
                    .select("metadata")
                    .eq("user_id", context.context.user_id)
                    .eq("provider", "posthog")
                    .maybe_single()
                    .execute()
                )
                if integration_resp.data and integration_resp.data.get("metadata"):
                    meta = integration_resp.data["metadata"]
                    env_vars["POSTHOG_PROJECT_ID"] = str(meta.get("project_id", ""))
                    env_vars["POSTHOG_REGION"] = meta.get("region", "us")

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

    # Enforce read-only access for PostHog before executing any command
    if required_provider_auth == "posthog":
        try:
            _assert_posthog_read_only(command)
        except ValueError as e:
            return {"stdout": "", "stderr": str(e), "exit_code": 1}

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


@function_tool
async def tool_fetch_url(context: RunContextWrapper[AgentContext], url: str) -> str:
    """Fetch the content of a URL and return it as clean text or markdown.
    Use this to read web pages, company sites, documentation, articles, etc.
    Args:
        url: The full URL to fetch (must include https://).
    """
    from app.utils.web_fetch import fetch_url
    try:
        return await fetch_url(url)
    except Exception as e:
        asyncio.create_task(log_error(context.context.user_id, "agent", e, context={
            "origin": "agent_tool", "tool": "tool_fetch_url", "url": url,
            "error_category": "infrastructure",
        }))
        raise


@function_tool
async def tool_spawn_code_task(
    context: RunContextWrapper[AgentContext],
    repo_url: str,
    spec: str,
    base_branch: str = "main",
) -> str:
    """Spawn a background coding agent to implement a feature in a GitHub repository.

    The agent clones the repo, implements the spec autonomously, and opens a PR when done.
    Progress updates are written to this chat thread throughout. Always read the
    coding-agent SKILL.md before calling this tool.

    Args:
      repo_url: Full HTTPS GitHub URL, e.g. https://github.com/owner/repo
      spec: Complete implementation spec. Must include acceptance criteria, stack context,
            and the required .task-output.json instruction at the end.
      base_branch: Branch to open the PR against. Defaults to main.
    """
    agent_session_id = context.context.agent_session_id
    user_id = context.context.user_id
    workspace_id = context.context.workspace_id

    print(f"[tool_spawn_code_task] called — repo={repo_url} branch={base_branch} session={agent_session_id} user={user_id}", flush=True)

    if not agent_session_id:
        print("[tool_spawn_code_task] ERROR: no agent_session_id on context", flush=True)
        return "Error: could not determine the current session. Please try again."

    if not repo_url.startswith("https://github.com/"):
        print(f"[tool_spawn_code_task] ERROR: invalid repo_url: {repo_url}", flush=True)
        return "Error: repo_url must be a full HTTPS GitHub URL (https://github.com/owner/repo)."

    try:
        supabase = get_supabase()
        from app.db.code_tasks import create_code_task
        from app.workers.queue import get_queue
        from app.workers.code_task import run_code_task

        task_id = create_code_task(
            supabase,
            agent_session_id=agent_session_id,
            user_id=user_id,
            workspace_id=workspace_id,
            repo_url=repo_url,
            base_branch=base_branch,
            spec=spec,
        )
        print(f"[tool_spawn_code_task] task created — task_id={task_id}", flush=True)

        queue = get_queue("code_tasks")
        job = queue.enqueue(run_code_task, task_id, job_timeout=60 * 100)
        print(f"[tool_spawn_code_task] enqueued — job_id={job.id} queue=code_tasks", flush=True)

        return (
            f"Coding task started (id: {task_id[:8]}). "
            f"Working on `{repo_url}` against branch `{base_branch}`. "
            f"Progress updates will appear in this thread. "
            f"A PR will be opened when complete."
        )
    except Exception as e:
        print(f"[tool_spawn_code_task] ERROR: {e}", flush=True)
        asyncio.create_task(log_error(user_id, "agent", e, context={
            "origin": "agent_tool", "tool": "tool_spawn_code_task", "repo_url": repo_url,
        }))
        return f"Failed to start coding task: {str(e)}"