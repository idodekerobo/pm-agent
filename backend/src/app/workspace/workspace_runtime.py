"""
Modal-based workspace runtime.

This module provides the execution environment for agent operations via Modal Sandboxes
and Volumes. Files are stored persistently in Modal Volumes, and commands execute inside
ephemeral Sandboxes.

The public interface is identical to local_workspace_runtime.py, enabling easy swapping
between backends via environment variable.
"""
from __future__ import annotations

from dataclasses import dataclass
import re
from pathlib import PurePosixPath
from typing import List

from .modal_sandbox import get_or_create_sandbox, WORKSPACE_MOUNT


@dataclass
class BashResult:
    stdout: str
    stderr: str
    exit_code: int


ANSI_ESCAPE_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")
DEFAULT_TERMINAL_ENV = {
    "NO_COLOR": "1",
    "CLICOLOR": "0",
    "TERM": "dumb",
}


def _strip_ansi(text: str) -> str:
    """Remove ANSI escape codes so output is parser-friendly."""
    return ANSI_ESCAPE_RE.sub("", text)


def _abs(path: str) -> str:
    """Convert a workspace-relative path to an absolute /workspace path."""
    if path in (".", ""):
        return WORKSPACE_MOUNT
    return f"{WORKSPACE_MOUNT}/{path.lstrip('/')}"


async def bash(
    workspace_id: str,
    command: str,
    cwd: str = ".",
    timeout_s: int = 60,
    organization_id: str = "local",
    user_id: str = None,
    sandbox_id: str | None = None,
    env: dict[str, str] | None = None,
    header: str | None = None,
) -> BashResult:
    """
    Run a bash command inside the agent workspace (Modal Sandbox).
    
    Args:
        workspace_id: Workspace identifier
        command: Shell command to run
        cwd: Relative working directory inside the workspace (default: ".")
        timeout_s: Timeout in seconds (default: 60)
        organization_id: Organization identifier (default: "local")
        user_id: User identifier (required for volume naming)
        sandbox_id: Optional sandbox ID to reconnect to (default: None, creates new)
        
    Returns:
        BashResult with stdout, stderr, exit_code
    """
    sb = await get_or_create_sandbox(organization_id, workspace_id, user_id, sandbox_id)
    
    # If running in a subdirectory, prepend cd
    if cwd and cwd != ".":
        command = f"cd {_abs(cwd)} && {command}"
    
    run_env = dict(DEFAULT_TERMINAL_ENV)
    if env:
        run_env.update(env)

    p = await sb.exec.aio("bash", "-lc", command, timeout=timeout_s, env=run_env)
    stdout = await p.stdout.read.aio()
    stderr = await p.stderr.read.aio()
    await p.wait.aio()
    return BashResult(
        stdout=_strip_ansi(stdout),
        stderr=_strip_ansi(stderr),
        exit_code=p.returncode,
    )


async def fs_write(
    workspace_id: str,
    path: str,
    content: str,
    organization_id: str = "local",
    user_id: str = None,
    sandbox_id: str | None = None,
) -> None:
    """
    Write a file to the workspace (Modal Volume).
    
    Args:
        workspace_id: Workspace identifier
        path: Relative path inside the workspace (no absolute paths)
        content: File contents to write
        organization_id: Organization identifier (default: "local")
        user_id: User identifier (required for volume naming)
        sandbox_id: Optional sandbox ID to reconnect to (default: None, creates new)
    """
    sb = await get_or_create_sandbox(organization_id, workspace_id, user_id, sandbox_id)
    parent = PurePosixPath(path).parent
    if parent != PurePosixPath("."):
        await sb.mkdir.aio(_abs(str(parent)), parents=True)
    f = await sb.open.aio(path, "w")
    async with f:
        await f.write.aio(content)


async def fs_read(
    workspace_id: str,
    path: str,
    organization_id: str = "local",
    user_id: str = None,
    sandbox_id: str | None = None,
) -> str:
    """
    Read a file from the workspace (Modal Volume).
    
    Args:
        workspace_id: Workspace identifier
        path: Relative path inside the workspace (no absolute paths)
        organization_id: Organization identifier (default: "local")
        user_id: User identifier (required for volume naming)
        sandbox_id: Optional sandbox ID to reconnect to (default: None, creates new)
        
    Returns:
        File contents as string
    """
    sb = await get_or_create_sandbox(organization_id, workspace_id, user_id, sandbox_id)
    f = await sb.open.aio(path, "r")
    async with f:
        return await f.read.aio()


async def fs_list(
    workspace_id: str,
    path: str = ".",
    organization_id: str = "local",
    user_id: str = None,
    sandbox_id: str | None = None,
) -> List[str]:
    """
    List directory contents in the workspace (Modal Volume).
    
    Args:
        workspace_id: Workspace identifier
        path: Relative path inside the workspace (default: ".")
        organization_id: Organization identifier (default: "local")
        user_id: User identifier (required for volume naming)
        sandbox_id: Optional sandbox ID to reconnect to (default: None, creates new)
        
    Returns:
        List of file/directory names in the specified path
    """
    sb = await get_or_create_sandbox(organization_id, workspace_id, user_id, sandbox_id)
    return await sb.ls.aio(_abs(path))
