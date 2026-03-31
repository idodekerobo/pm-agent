"""Slack app configuration — single source of truth for scopes, events, and manifest.

The manifest dict can be used to:
  - document the expected Slack app shape for new contributors
  - validate local state against what's in the Slack dashboard
  - generate a manifest JSON to paste into api.slack.com when updating the app
"""

# Bot token scopes the app requests during OAuth
BOT_SCOPES: list[str] = [
    "app_mentions:read",
    "channels:history",
    "channels:read",
    "chat:write",
    "commands",
    "emoji:read",
    "files:read",
    "files:write",
    "groups:history",
    "groups:read",
    "im:history",
    "im:write",
    "mpim:history",
    "mpim:read",
    "pins:read",
    "pins:write",
    "reactions:read",
    "reactions:write",
    "remote_files:read",
    "search:read.files",
    "users:read",
]

# Slack event types the bot subscribes to
BOT_EVENTS: list[str] = [
    "app_mention",
    "app_uninstalled",
    "channel_rename",
    "file_change",
    "file_created",
    "file_shared",
    "member_joined_channel",
    "member_left_channel",
    "message.channels",
    "message.groups",
    "message.im",
    "message.mpim",
    "pin_added",
    "pin_removed",
    "reaction_added",
    "reaction_removed",
]

_API_BASE_URL = "https://api.draftai.us"

REDIRECT_URI = f"{_API_BASE_URL}/integrations/slack/callback"
WEBHOOK_URL = f"{_API_BASE_URL}/webhook/slack"


def build_manifest() -> dict:
    """Return the full Slack app manifest as a dict.

    Useful for diffing against the Slack dashboard or generating JSON to paste
    into api.slack.com when updating the app.
    """
    return {
        "display_information": {
            "name": "Draft Product Manager Agent",
            "description": "The agent that makes your life easier.",
            "background_color": "#2D2E30",
            "long_description": (
                "The Draft PM Agent Slack app brings everything that you can do inside the web app to Slack:\n"
                "- tell the agent bot to do things like create a PRD from the contents of a Slack message\n"
                "- tell the agent bot to do things like fix a specific bug from the contents of a slack thread or channel\n"
                "- create and edit product specs, spreadsheets, databases and more from Slack\n"
                "- update Notion docs/databases and Google docs, spreadsheets and slides with a simple @-tag"
            ),
        },
        "features": {
            "bot_user": {
                "display_name": "Draft Product Manager Agent",
                "always_online": False,
            }
        },
        "oauth_config": {
            "redirect_urls": [REDIRECT_URI],
            "scopes": {"bot": BOT_SCOPES},
            "pkce_enabled": False,
        },
        "settings": {
            "event_subscriptions": {
                "request_url": WEBHOOK_URL,
                "bot_events": BOT_EVENTS,
            },
            "org_deploy_enabled": False,
            "socket_mode_enabled": False,
            "token_rotation_enabled": False,
        },
    }
