"""draft-bridge CLI entry point.

Commands:
  draft-bridge auth     Authenticate with your draftai.us account (run once).
  draft-bridge start    Start the bridge server on local.draftai.us:7349.
"""

import click
from pathlib import Path

from draft_bridge.auth import run_auth


@click.group()
def main():
    """Draft Bridge — connect the Draft web app to your local Claude Code."""


@main.command()
@click.option(
    "--reauth",
    is_flag=True,
    default=False,
    help="Force re-authentication even if a token already exists.",
)
def auth(reauth: bool):
    """Authenticate draft-bridge with your draftai.us account."""
    run_auth(reauth=reauth)


@main.command("install")
def install_cmd():
    """Bootstrap ~/.draft workspace and install Draft agents + skills into ~/.claude."""
    from draft_bridge.bootstrap import install_draft
    install_draft()


@main.command()
@click.option(
    "--workspace",
    default=None,
    type=click.Path(exists=True, file_okay=False, resolve_path=True),
    help="Working directory for Claude Code (absolute or relative). Defaults to current directory.",
)
def start(workspace: str | None):
    """Start the bridge server on local.draftai.us:7349."""
    import logging
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    from draft_bridge import keychain
    from draft_bridge.bootstrap import install_draft, is_installed
    from draft_bridge.server import run

    if not keychain.load_token():
        click.echo("No auth token found. Starting authentication first...")
        run_auth()

    if not is_installed():
        click.echo("First-time setup — installing Draft workspace...")
        install_draft()

    run(workspace_path=Path(workspace) if workspace else Path.cwd())
