import modal
from .modal_app import get_modal_app
from app.db.supabase_client import get_supabase
from app.db.workspaces import get_workspace, update_workspace_sandbox_id

WORKSPACE_MOUNT = "/workspace"


def volume_name(organization_id: str, workspace_id: str) -> str:
    """Generate a Modal Volume name from organization and workspace IDs."""
    return f"pmagent-{organization_id}-{workspace_id}"

def get_or_create_volume(organization_id: str, workspace_id: str) -> modal.Volume:
    """Get or create a Modal Volume for the workspace."""
    return modal.Volume.from_name(
        volume_name(organization_id, workspace_id),
        create_if_missing=True,
    )

def _try_reconnect(sandbox_id: str) -> modal.Sandbox | None:
    """Helper to check if a specific sandbox ID is still running."""
    try:
        sb = modal.Sandbox.from_id(sandbox_id)
        if sb.poll() is None:
            return sb
    except Exception:
        pass
    return None

def get_or_create_sandbox(
    organization_id: str,
    workspace_id: str,
    last_sandbox_id: str | None = None,
) -> modal.Sandbox:
    """
    Try to reconnect to an existing running sandbox first.
    If it's gone (timeout, crash, etc.), spin up a fresh one
    mounting the same Volume — all files are preserved.
    """
    if last_sandbox_id:
        sb = _try_reconnect(last_sandbox_id)
        if sb:
            return sb

    supabase = get_supabase()
    workspace_row = get_workspace(supabase, workspace_id=workspace_id)
    db_sandbox_id = workspace_row.get("last_sandbox_id")

    if db_sandbox_id and db_sandbox_id != last_sandbox_id:
        sb = _try_reconnect(db_sandbox_id)
        if sb:
            return sb

    vol = get_or_create_volume(organization_id, workspace_id)
    app = get_modal_app()

    sb = modal.Sandbox.create(
        image=modal.Image.debian_slim(),
        volumes={WORKSPACE_MOUNT: vol},
        workdir=WORKSPACE_MOUNT,
        app=app,
        timeout=60 * 60,  # max lifetime: 1 hour
        idle_timeout=30 * 60,  # auto-terminate after 30 min idle
    )

    update_workspace_sandbox_id(
        supabase, 
        workspace_id=workspace_id, 
        sandbox_id=sb.object_id
    )
    
    return sb
