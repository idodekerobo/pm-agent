from dataclasses import dataclass
from typing import Any, Optional

from agents import RunContextWrapper, function_tool
from app.workspace.workspace_runtime import bash as ws_bash
from app.workspace.workspace_runtime import fs_read, fs_list, fs_write

@dataclass
class AgentContext:
    tenant_id: str
    workspace_id: str

@function_tool
def tool_fs_write(context: RunContextWrapper[AgentContext], path: str, content: str) -> str:
    """
    Write a file inside the agent workspace.
    Args:
        path: Relaive path inside the workspace (no ..).
        content: File contents.
    """
    fs_write(context.context.workspace_id, path, content, tenant_id=context.context.tenant_id)
    return f"Wrote '{path}'."

@function_tool
def tool_fs_read(context: RunContextWrapper[AgentContext], path: str) -> str:
    """Read a file inside the agent workspace.
    Args:
      path: Relative path inside the workspace (no ..).
    """
    return fs_read(context.context.workspace_id, path, tenant_id=context.context.tenant_id)

@function_tool
def tool_fs_list(context: RunContextWrapper[AgentContext], path: str = ".") -> list[str]:
    """List files inside the agent workspace.
    Args:
      path: Relative path inside the workspace.
    """
    return fs_list(context.context.workspace_id, path=path, tenant_id=context.context.tenant_id)

@function_tool
def tool_bash(context: RunContextWrapper[AgentContext], command: str, cwd: str = ".", timeout_s: int = 60) -> dict[str, Any]:
    """Run a bash command inside the agent workspace.
    Args:
      command: Shell command to run.
      cwd: Relative working directory inside the workspace.
      timeout_s: Timeout in seconds.
    """
    result = ws_bash(
        context.context.workspace_id,
        command=command,
        cwd=cwd,
        timeout_s=timeout_s,
        tenant_id=context.context.tenant_id,
    )
    return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.exit_code}