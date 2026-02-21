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

async def _try_reconnect(sandbox_id: str) -> modal.Sandbox | None:
    """Helper to check if a specific sandbox ID is still running."""
    try:
        sb = await modal.Sandbox.from_id.aio(sandbox_id)
        if await sb.poll.aio() is None:
            return sb
    except Exception:
        pass
    return None

def get_agent_image() -> modal.Image:
    return (
        modal.Image.debian_slim()
        .apt_install("curl", "git", "unzip")
        .run_commands(
            "curl -fsSL https://deno.land/x/install/install.sh | DENO_INSTALL=/usr/local sh",
            "/usr/local/bin/deno install --root /usr/local -A --reload -f -g -n linear jsr:@schpet/linear-cli",
        )
    )

async def get_or_create_sandbox(
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
        sb = await _try_reconnect(last_sandbox_id)
        if sb:
            return sb

    supabase = get_supabase()
    workspace_row = get_workspace(supabase, workspace_id=workspace_id)
    db_sandbox_id = workspace_row.get("last_sandbox_id")

    if db_sandbox_id and db_sandbox_id != last_sandbox_id:
        sb = await _try_reconnect(db_sandbox_id)
        if sb:
            return sb

    vol = get_or_create_volume(organization_id, workspace_id)
    app = await get_modal_app()

    sb = await modal.Sandbox.create.aio(
        image=get_agent_image(),
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
