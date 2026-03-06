from __future__ import annotations

from pathlib import Path, PurePosixPath
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import auth_protect_route
from app.agents.context import resolve_workspace_context
from app.db.supabase_client import get_supabase
from app.db.workspaces import get_workspace
from app.config import settings

router = APIRouter()

WORKSPACE_MOUNT = "/workspace"


# ---------------------------------------------------------------------------
# Path safety
# ---------------------------------------------------------------------------

def _safe_rel_path(raw: str) -> str:
    """Validate and normalize a user-supplied relative path.

    Rejects absolute paths and directory-traversal attempts (any '..' component).
    Returns a clean POSIX string with no leading slash.
    """
    p = PurePosixPath(raw.strip())
    if p.is_absolute() or ".." in p.parts:
        raise HTTPException(status_code=400, detail="Invalid path")
    # Normalize to remove redundant separators; default '.' to empty string
    normalized = str(p) if str(p) != "." else "."
    return normalized


def _abs_volume_path(rel: str) -> str:
    """Convert a relative workspace path to a volume-root path.

    WORKSPACE_MOUNT (/workspace) is the sandbox mount point — not a directory
    in the volume itself. Via the direct Volume API, volume root == workspace root.
    """
    if rel in (".", ""):
        return "/"
    return f"/{rel.lstrip('/')}"


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class FileEntry(BaseModel):
    name: str
    type: str          # "file" | "directory"
    path: str          # relative path from workspace root
    size: Optional[int] = None


class ListDirectoryResponse(BaseModel):
    path: str
    entries: List[FileEntry]


class ReadFileResponse(BaseModel):
    path: str
    content: str


class WriteFileRequest(BaseModel):
    path: str
    content: str


class WorkspaceStatusResponse(BaseModel):
    workspace_id: str
    agent_run_status: str


# ---------------------------------------------------------------------------
# Production helpers (Modal Volume direct API)
# ---------------------------------------------------------------------------

async def _list_modal(user_id: str, rel_path: str) -> List[FileEntry]:
    from app.workspace.modal_sandbox import get_or_create_volume
    vol = get_or_create_volume(user_id)
    abs_path = _abs_volume_path(rel_path)
    try:
        raw = await vol.listdir.aio(abs_path)
    except Exception as exc:
        exc_str = str(exc).lower()
        if "not found" in exc_str or "no such" in exc_str:
            print(f"[filesystem] WARNING: path {abs_path!r} not found in volume for user {user_id!r}", flush=True)
            return []
        raise HTTPException(status_code=500, detail=f"Volume error: {exc}")

    parent_rel = rel_path if rel_path != "." else ""
    entries: List[FileEntry] = []
    for entry in raw:
        # Modal FileEntry has: path (full abs), type (FileType enum or raw int), mtime, size
        # type values: UNSPECIFIED=0, FILE/REGULAR=1, DIRECTORY=2, SYMLINK=3
        entry_name = PurePosixPath(entry.path).name
        type_repr = str(entry.type).upper()
        print(f"[filesystem] entry {entry_name!r}: type={entry.type!r} ({type(entry.type).__name__})", flush=True)
        try:
            is_dir = "DIRECTORY" in type_repr or int(entry.type) == 2
        except (TypeError, ValueError):
            is_dir = "DIRECTORY" in type_repr
        entry_rel = f"{parent_rel}/{entry_name}".lstrip("/") if parent_rel else entry_name
        entries.append(FileEntry(
            name=entry_name,
            type="directory" if is_dir else "file",
            path=entry_rel,
            size=None if is_dir else getattr(entry, "size", None),
        ))
    return sorted(entries, key=lambda e: (e.type == "file", e.name))


async def _read_modal(user_id: str, rel_path: str) -> str:
    from app.workspace.modal_sandbox import get_or_create_volume
    vol = get_or_create_volume(user_id)
    abs_path = _abs_volume_path(rel_path)
    try:
        chunks = []
        async for chunk in vol.read_file.aio(abs_path):
            chunks.append(chunk)
        raw_bytes = b"".join(chunks)
    except Exception as exc:
        exc_str = str(exc).lower()
        if "is a directory" in exc_str or ("directory" in exc_str and "not" not in exc_str):
            raise HTTPException(status_code=400, detail="Path is a directory, not a file")
        if "not found" in exc_str or "no such" in exc_str:
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=f"Volume error: {exc}")
    try:
        return raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="File is binary and cannot be displayed as text")


async def _write_modal(user_id: str, rel_path: str, content: str) -> None:
    import asyncio
    import io
    from app.workspace.modal_sandbox import get_or_create_volume
    vol = get_or_create_volume(user_id)
    abs_path = _abs_volume_path(rel_path)
    data = content.encode("utf-8")

    def _do_write():
        with vol.batch_upload(force=True) as batch:
            batch.put_file(io.BytesIO(data), abs_path)

    try:
        await asyncio.to_thread(_do_write)
    except Exception as exc:
        print(f"[filesystem] ERROR batch_upload({abs_path!r}): {type(exc).__name__}: {exc}", flush=True)
        raise HTTPException(status_code=500, detail=f"Volume error: {exc}")


async def _delete_modal(user_id: str, rel_path: str) -> None:
    from app.workspace.modal_sandbox import get_or_create_volume
    vol = get_or_create_volume(user_id)
    abs_path = _abs_volume_path(rel_path)
    try:
        await vol.remove_file.aio(abs_path)
    except Exception as exc:
        if "not found" in str(exc).lower() or "no such" in str(exc).lower():
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=500, detail=f"Volume error: {exc}")


# ---------------------------------------------------------------------------
# Local dev helpers (local filesystem via local_workspace_runtime)
# ---------------------------------------------------------------------------

def _list_local(organization_id: str, workspace_id: str, rel_path: str) -> List[FileEntry]:
    from app.workspace.local_workspace_runtime import ensure_workspace, safe_path_join, UnsafePathError
    root = ensure_workspace(workspace_id, organization_id)
    try:
        target = safe_path_join(root, rel_path)
    except UnsafePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not target.exists():
        return []
    if target.is_file():
        raise HTTPException(status_code=400, detail="Path is a file, not a directory")

    entries: List[FileEntry] = []
    for p in sorted(target.iterdir()):
        entry_rel = str(p.relative_to(root))
        entries.append(FileEntry(
            name=p.name,
            type="directory" if p.is_dir() else "file",
            path=entry_rel,
            size=None if p.is_dir() else p.stat().st_size,
        ))
    return sorted(entries, key=lambda e: (e.type == "file", e.name))


def _read_local(organization_id: str, workspace_id: str, rel_path: str) -> str:
    from app.workspace.local_workspace_runtime import ensure_workspace, safe_path_join, UnsafePathError
    root = ensure_workspace(workspace_id, organization_id)
    try:
        target = safe_path_join(root, rel_path)
    except UnsafePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    try:
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="File is binary and cannot be displayed as text")


def _write_local(organization_id: str, workspace_id: str, rel_path: str, content: str) -> None:
    from app.workspace.local_workspace_runtime import ensure_workspace, safe_path_join, UnsafePathError
    root = ensure_workspace(workspace_id, organization_id)
    try:
        target = safe_path_join(root, rel_path)
    except UnsafePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def _delete_local(organization_id: str, workspace_id: str, rel_path: str) -> None:
    from app.workspace.local_workspace_runtime import ensure_workspace, safe_path_join, UnsafePathError
    root = ensure_workspace(workspace_id, organization_id)
    try:
        target = safe_path_join(root, rel_path)
    except UnsafePathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not target.exists():
        raise HTTPException(status_code=404, detail="File not found")
    if target.is_dir():
        raise HTTPException(status_code=400, detail="Cannot delete a directory via this endpoint")
    target.unlink()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/filesystem/workspace-status", response_model=WorkspaceStatusResponse)
def get_workspace_status(user_id: str = Depends(auth_protect_route)):
    """Return the current workspace ID and agent_run_status for the authenticated user."""
    supabase = get_supabase()
    _, _, workspace_id, _, _profile = resolve_workspace_context(supabase, user_id)
    workspace = get_workspace(supabase, workspace_id=workspace_id)
    return WorkspaceStatusResponse(
        workspace_id=workspace_id,
        agent_run_status=workspace.agent_run_status,
    )


@router.get("/filesystem", response_model=ListDirectoryResponse)
async def list_directory(
    path: str = ".",
    user_id: str = Depends(auth_protect_route),
):
    """List the contents of a directory in the agent's workspace volume."""
    rel = _safe_rel_path(path)
    supabase = get_supabase()
    organization_id, _, workspace_id, _, _profile = resolve_workspace_context(supabase, user_id)

    if settings.workspace_backend == "production":
        entries = await _list_modal(user_id, rel)
    else:
        entries = _list_local(organization_id, workspace_id, rel)

    return ListDirectoryResponse(path=rel, entries=entries)


@router.get("/filesystem/file", response_model=ReadFileResponse)
async def read_file(
    path: str,
    user_id: str = Depends(auth_protect_route),
):
    """Read a text file from the agent's workspace volume."""
    rel = _safe_rel_path(path)
    supabase = get_supabase()
    organization_id, _, workspace_id, _, _profile = resolve_workspace_context(supabase, user_id)

    if settings.workspace_backend == "production":
        content = await _read_modal(user_id, rel)
    else:
        content = _read_local(organization_id, workspace_id, rel)

    return ReadFileResponse(path=rel, content=content)


@router.put("/filesystem/file", response_model=ReadFileResponse)
async def write_file(
    body: WriteFileRequest,
    user_id: str = Depends(auth_protect_route),
):
    """Create or overwrite a text file in the agent's workspace volume."""
    rel = _safe_rel_path(body.path)
    supabase = get_supabase()
    organization_id, _, workspace_id, _, _profile = resolve_workspace_context(supabase, user_id)

    if settings.workspace_backend == "production":
        await _write_modal(user_id, rel, body.content)
    else:
        _write_local(organization_id, workspace_id, rel, body.content)

    return ReadFileResponse(path=rel, content=body.content)


@router.delete("/filesystem/file")
async def delete_file(
    path: str,
    user_id: str = Depends(auth_protect_route),
):
    """Delete a file from the agent's workspace volume."""
    rel = _safe_rel_path(path)
    supabase = get_supabase()
    organization_id, _, workspace_id, _, _profile = resolve_workspace_context(supabase, user_id)

    if settings.workspace_backend == "production":
        await _delete_modal(user_id, rel)
    else:
        _delete_local(organization_id, workspace_id, rel)

    return {"ok": True}
