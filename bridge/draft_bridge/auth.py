"""draft-bridge auth — authenticate with your draftai.us account.

Flow:
  1. If a token already exists in keychain and --reauth is not set, exit early.
  2. Start a temporary HTTP listener on localhost:CALLBACK_PORT.
  3. Open the browser to BRIDGE_AUTH_URL (the web app's /bridge-auth page).
  4. The web app calls POST /bridge/token server-side and redirects back with the raw token.
  5. Store the token in the OS keychain via keyring.
"""

import webbrowser

import click

from draft_bridge._http_listener import CallbackServer
from draft_bridge import keychain
from draft_bridge.constants import AUTH_TIMEOUT_SECONDS, BRIDGE_AUTH_URL, CALLBACK_PORT


def run_auth(reauth: bool = False) -> None:
    if not reauth and keychain.load_token():
        click.echo("Already authenticated. Run `draft-bridge auth --reauth` to re-authenticate.")
        return

    server = CallbackServer()
    try:
        server.start()
    except OSError:
        raise click.ClickException(
            f"Port {CALLBACK_PORT} is already in use. "
            "Is another draft-bridge process running?"
        )

    click.echo("Opening browser to authenticate...")
    webbrowser.open(BRIDGE_AUTH_URL)
    click.echo(f"Waiting for authentication (timeout: {AUTH_TIMEOUT_SECONDS}s)...")
    click.echo("(You may be prompted to allow keychain access on macOS.)")

    token = server.wait_for_token(timeout=AUTH_TIMEOUT_SECONDS)
    server.stop()

    if token is None:
        raise click.ClickException(
            "Authentication timed out. Please try again."
        )

    keychain.store_token(token)
    click.echo("Bridge authenticated. Token stored in keychain.")
    click.echo("Run `draft-bridge start` to start the bridge server.")
