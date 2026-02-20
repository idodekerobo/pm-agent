from __future__ import annotations

import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

class UnsafePathError(ValueError):
    pass

# TOOD: this needs to change
def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]

def _workspace_root(workspace_id: str, organization_id: str = "local") -> Path:
    return (
        _repo_root()
        / "organizations"
        / organization_id
        / "workspaces"
        / workspace_id
        / "workspace"
    )

def ensure_workspace(workspace_id: str, organization_id: str) -> Path:
    root = _workspace_root(workspace_id, organization_id)
    root.mkdir(parents=True, exist_ok=True)
    return root

def safe_path_join(workspace_root: Path, rel_path: str) -> Path:
    p = Path(rel_path)
    if p.is_absolute():
        raise UnsafePathError("Absolute paths are not allowed")

    normalized = (workspace_root / p).resolve()
    if workspace_root.resolve() not in normalized.parents and normalized != workspace_root.resolve():
        raise UnsafePathError("Path escapes workspace root.")

    return normalized

def fs_write(workspace_id: str, path: str, content: str, organization_id: str) -> None:
    root = ensure_workspace(workspace_id, organization_id)
    target = safe_path_join(root, path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")

def fs_read(workspace_id: str, path: str, organization_id: str) -> str:
    root = ensure_workspace(workspace_id, organization_id)
    target = safe_path_join(root, path)
    return target.read_text(encoding="utf-8")

def fs_list(workspace_id: str, path: str = ".", organization_id: str = "local") -> List[str]:
    root = ensure_workspace(workspace_id, organization_id)
    target = safe_path_join(root, path)

    if not target.exists():
        return []

    if target.is_file():
        return [target.name]

    return sorted([p.name for p in target.iterdir()])

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

def bash(
    workspace_id: str,
    command: str,
    cwd: str = ".",
    timeout_s: int = 60,
    organization_id: str = "local",
    env: dict[str, str] | None = None,
) -> BashResult:
    root = ensure_workspace(workspace_id, organization_id)
    cwd_path = safe_path_join(root, cwd)
    run_env = {**os.environ}
    for key, value in DEFAULT_TERMINAL_ENV.items():
        run_env.setdefault(key, value)
    if env:
        run_env.update(env)

    proc = subprocess.run(
        ["bash", "-lc", command],
        cwd=str(cwd_path),
        capture_output=True,
        text=True,
        timeout=timeout_s,
        env=run_env,
    )

    return BashResult(
        stdout=_strip_ansi(proc.stdout),
        stderr=_strip_ansi(proc.stderr),
        exit_code=proc.returncode,
    )