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
from typing import List

from .modal_sandbox import get_or_create_sandbox, WORKSPACE_MOUNT


@dataclass
class BashResult:
    stdout: str
    stderr: str
    exit_code: int


def _abs(path: str) -> str:
    """Convert a workspace-relative path to an absolute /workspace path."""
    if path in (".", ""):
        return WORKSPACE_MOUNT
    return f"{WORKSPACE_MOUNT}/{path.lstrip('/')}"


def bash(
    workspace_id: str,
    command: str,
    cwd: str = ".",
    timeout_s: int = 60,
    organization_id: str = "local",
    sandbox_id: str | None = None,
) -> BashResult:
    """
    Run a bash command inside the agent workspace (Modal Sandbox).
    
    Args:
        workspace_id: Workspace identifier
        command: Shell command to run
        cwd: Relative working directory inside the workspace (default: ".")
        timeout_s: Timeout in seconds (default: 60)
        organization_id: Organization identifier (default: "local")
        sandbox_id: Optional sandbox ID to reconnect to (default: None, creates new)
        
    Returns:
        BashResult with stdout, stderr, exit_code
    """
    sb = get_or_create_sandbox(organization_id, workspace_id, sandbox_id)
    
    # If running in a subdirectory, prepend cd
    if cwd and cwd != ".":
        command = f"cd {_abs(cwd)} && {command}"
    
    p = sb.exec("bash", "-lc", command, timeout=timeout_s)
    return BashResult(
        stdout=p.stdout.read(),
        stderr=p.stderr.read(),
        exit_code=p.returncode,
    )


def fs_write(
    workspace_id: str,
    path: str,
    content: str,
    organization_id: str = "local",
    sandbox_id: str | None = None,
) -> None:
    """
    Write a file to the workspace (Modal Volume).
    
    Args:
        workspace_id: Workspace identifier
        path: Relative path inside the workspace (no absolute paths)
        content: File contents to write
        organization_id: Organization identifier (default: "local")
        sandbox_id: Optional sandbox ID to reconnect to (default: None, creates new)
    """
    sb = get_or_create_sandbox(organization_id, workspace_id, sandbox_id)
    with sb.open(path, "w") as f:
        f.write(content)


def fs_read(
    workspace_id: str,
    path: str,
    organization_id: str = "local",
    sandbox_id: str | None = None,
) -> str:
    """
    Read a file from the workspace (Modal Volume).
    
    Args:
        workspace_id: Workspace identifier
        path: Relative path inside the workspace (no absolute paths)
        organization_id: Organization identifier (default: "local")
        sandbox_id: Optional sandbox ID to reconnect to (default: None, creates new)
        
    Returns:
        File contents as string
    """
    sb = get_or_create_sandbox(organization_id, workspace_id, sandbox_id)
    with sb.open(path, "r") as f:
        return f.read()


def fs_list(
    workspace_id: str,
    path: str = ".",
    organization_id: str = "local",
    sandbox_id: str | None = None,
) -> List[str]:
    """
    List directory contents in the workspace (Modal Volume).
    
    Args:
        workspace_id: Workspace identifier
        path: Relative path inside the workspace (default: ".")
        organization_id: Organization identifier (default: "local")
        sandbox_id: Optional sandbox ID to reconnect to (default: None, creates new)
        
    Returns:
        List of file/directory names in the specified path
    """
    sb = get_or_create_sandbox(organization_id, workspace_id, sandbox_id)
    return sb.ls(_abs(path))
