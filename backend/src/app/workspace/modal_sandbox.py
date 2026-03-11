import modal
from .modal_app import get_modal_app
from app.db.supabase_client import get_supabase
from app.db.workspaces import get_workspace, update_workspace_sandbox_id, update_workspace_sandbox_status

WORKSPACE_MOUNT = "/workspace"


def volume_name(user_id: str, organization_id: str = None, workspace_id: str = None) -> str:
    """Generate a Modal Volume name from user ID."""
    return f"pm-agent-{user_id}"

def get_or_create_volume(user_id: str, organization_id: str = None, workspace_id: str = None) -> modal.Volume:
    """Get or create a Modal Volume for the workspace."""
    return modal.Volume.from_name(
        volume_name(user_id, organization_id, workspace_id),
        create_if_missing=True,
    )

def get_agent_image() -> modal.Image:
    return (
        modal.Image.debian_slim()
        .apt_install("curl", "git", "unzip", "jq")
        .run_commands(
            # Install Node.js 22 LTS via NodeSource (EOL April 2027)
            "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs",
            # Install GitHub CLI via official Debian package repo
            "mkdir -p -m 755 /etc/apt/keyrings"
            " && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null"
            " && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg"
            " && mkdir -p -m 755 /etc/apt/sources.list.d"
            " && echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null"
            " && apt update && apt install gh -y",
            # Install Deno + Linear CLI
            "curl -fsSL https://deno.land/x/install/install.sh | DENO_INSTALL=/usr/local sh",
            "/usr/local/bin/deno install --root /usr/local -A --reload -f -g -n linear jsr:@schpet/linear-cli",
            # Install Claude Code CLI
            "npm install -g @anthropic-ai/claude-code",
        )
    )


async def reconnect_sandbox(sandbox_id: str | None) -> modal.Sandbox | None:
    """Return a live sandbox if sandbox_id is still running, else None."""
    if not sandbox_id:
        return None
    try:
        sb = await modal.Sandbox.from_id.aio(sandbox_id)
        if await sb.poll.aio() is None:
            return sb
    except Exception:
        pass
    return None


async def create_sandbox(
    workspace_id: str,
    user_id: str,
    organization_id: str,
    supabase,
) -> modal.Sandbox:
    """Spin up a new Modal sandbox, persist its ID, and return it."""
    vol = get_or_create_volume(user_id, organization_id, workspace_id)
    app = await get_modal_app()

    sb = await modal.Sandbox.create.aio(
        image=get_agent_image(),
        volumes={WORKSPACE_MOUNT: vol},
        workdir=WORKSPACE_MOUNT,
        app=app,
        timeout=60 * 60,  # max lifetime: 1 hour
        idle_timeout=30 * 60,  # auto-terminate after 30 min idle
    )

    update_workspace_sandbox_id(supabase, workspace_id=workspace_id, sandbox_id=sb.object_id)
    return sb


async def get_or_create_sandbox(
    organization_id: str,
    workspace_id: str,
    user_id: str,
    last_sandbox_id: str | None = None,
) -> modal.Sandbox:
    """
    Return a running sandbox, reconnecting to an existing one if possible.

    1. Fast path: try the in-memory sandbox_id hint — no DB read needed.
    2. Fallback: read DB for a fresher ID (e.g. updated by a concurrent request).
    3. Create: all reconnect attempts failed — mark old sandbox stopped, spin up a new one.
    """
    # 1. Fast path — no DB read needed
    if sb := await reconnect_sandbox(last_sandbox_id):
        return sb

    # 2. Read DB for the most current sandbox ID
    supabase = get_supabase()
    workspace_row = get_workspace(supabase, workspace_id=workspace_id)

    if workspace_row.last_sandbox_id != last_sandbox_id:
        if sb := await reconnect_sandbox(workspace_row.last_sandbox_id):
            return sb

    # 3. All reconnect attempts failed — create a fresh sandbox
    if workspace_row.sandbox_status == "running":
        update_workspace_sandbox_status(supabase, workspace_id=workspace_id, status="stopped")

    return await create_sandbox(workspace_id, user_id, organization_id, supabase)
