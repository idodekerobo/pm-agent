"""draft-bridge CLI entry point.

Commands:
  draft-bridge auth     Authenticate with your draftai.us account (run once).
  draft-bridge start    Start the bridge server on local.draftai.us:7349.
"""

import click

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


@main.command()
def start():
    """Start the bridge server on local.draftai.us:7349."""
    from draft_bridge import keychain
    from draft_bridge.server import run

    if not keychain.load_token():
        click.echo("No auth token found. Starting authentication first...")
        run_auth()

    run()
