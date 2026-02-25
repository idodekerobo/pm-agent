from dataclasses import dataclass
from typing import Any, Optional

from agents import RunContextWrapper, function_tool
from app.config import settings
from app.db.supabase_client import get_supabase
from app.integrations.manager import get_valid_token

if settings.workspace_backend == "production":
    from app.workspace.workspace_runtime import bash as ws_bash
    from app.workspace.workspace_runtime import fs_read, fs_list, fs_write
else:
    from app.workspace.local_workspace_runtime import bash as ws_bash
    from app.workspace.local_workspace_runtime import fs_read, fs_list, fs_write

@dataclass
class AgentContext:
    organization_id: str
    user_id: str
    workspace_id: str
    sandbox_id: str | None = None

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
    if required_provider_auth:
        supabase = get_supabase()
        try:
            token = await get_valid_token(
                supabase,
                user_id=context.context.user_id,
                provider=required_provider_auth,
            )
            if required_provider_auth == "linear":
                # Prepend Bearer for OAuth tokens, not needed for API tokens
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
        env=env_vars
    )
    return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.exit_code}