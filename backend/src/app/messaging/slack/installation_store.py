"""DB helpers for slack_installations and slack_channels tables.

Calls get_supabase() internally rather than accepting a client param —
these functions are called from the agent dispatcher and RQ background
tasks where no client is already in scope.
"""

from datetime import datetime, timezone
from app.db.supabase_client import get_supabase
from app.integrations.crypto import encrypt_token, decrypt_token
from app.schemas.slack import SlackInstallation, SlackChannel


def _decrypt_installation(row: dict) -> SlackInstallation:
    """Decrypt bot_token in-place and return a typed SlackInstallation."""
    row["bot_token"] = decrypt_token(row["bot_token"])
    return SlackInstallation.model_validate(row)


def get_installation_by_id(installation_id: str) -> SlackInstallation | None:
    """Look up an installation by its primary key UUID.

    Used by the RQ worker after receiving installation_id from the webhook route.

    Returns the installation with bot_token already decrypted,
    or None if no matching installation exists.
    """
    supabase = get_supabase()
    result = (
        supabase.table("slack_installations")
        .select("*")
        .eq("id", installation_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        return None
    return _decrypt_installation(result.data)


def get_installation_by_team_id(slack_team_id: str) -> SlackInstallation | None:
    """Look up an installation by Slack team/workspace ID.

    Used when routing an incoming webhook event to the right user.

    Returns the installation with bot_token already decrypted,
    or None if no matching installation exists.
    """
    supabase = get_supabase()
    result = (
        supabase.table("slack_installations")
        .select("*")
        .eq("slack_team_id", slack_team_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        return None
    return _decrypt_installation(result.data)


def get_installation_by_user_id(user_id: str) -> SlackInstallation | None:
    """Look up an installation by the PM Agent user ID.

    Used by the agent dispatcher (tool_slack) to find the bot token
    for the currently authenticated user.

    Returns the installation with bot_token already decrypted,
    or None if the user has not connected Slack.
    """
    supabase = get_supabase()
    result = (
        supabase.table("slack_installations")
        .select("*")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        return None
    return _decrypt_installation(result.data)


def save_installation(user_id: str, oauth_response: dict) -> SlackInstallation:
    """Persist a new (or updated) Slack installation after the OAuth callback.

    Upserts on (user_id, slack_team_id) so re-installs from the same workspace
    update the existing row rather than creating a duplicate.

    Args:
        user_id: PM Agent user UUID.
        oauth_response: The parsed JSON body from Slack's OAuth v2 access response.

    Returns:
        The upserted installation with bot_token decrypted for immediate use.
    """
    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    payload = {
        "user_id": user_id,
        "slack_team_id": oauth_response["team"]["id"],
        "slack_team_name": oauth_response["team"].get("name"),
        "slack_bot_user_id": oauth_response["bot_user_id"],
        "slack_app_id": oauth_response["app_id"],
        "bot_token": encrypt_token(oauth_response["access_token"]),
        "installer_slack_user_id": oauth_response.get("authed_user", {}).get("id"),
        "updated_at": now,
    }

    result = (
        supabase.table("slack_installations")
        .upsert(payload, on_conflict="user_id,slack_team_id")
        .execute()
    )
    return _decrypt_installation(result.data[0])


def get_channels(installation_id: str, *, enabled_only: bool = False) -> list[SlackChannel]:
    """List all channels for an installation.

    Args:
        installation_id: UUID of the slack_installations row.
        enabled_only: If True, only return channels where is_enabled = True.

    Returns:
        List of SlackChannel objects.
    """
    supabase = get_supabase()
    query = (
        supabase.table("slack_channels")
        .select("*")
        .eq("installation_id", installation_id)
        .order("added_at", desc=False)
    )
    if enabled_only:
        query = query.eq("is_enabled", True)
    result = query.execute()
    return [SlackChannel.model_validate(row) for row in (result.data or [])]


def upsert_channel(
    installation_id: str,
    channel_id: str,
    channel_name: str | None,
) -> SlackChannel:
    """Register a channel the bot has been added to.

    Called from the member_joined_channel event handler. Upserts on
    (installation_id, slack_channel_id) so duplicate events are idempotent.

    Returns:
        The upserted SlackChannel object.
    """
    supabase = get_supabase()
    payload = {
        "installation_id": installation_id,
        "slack_channel_id": channel_id,
        "slack_channel_name": channel_name,
        "is_enabled": True,
    }
    result = (
        supabase.table("slack_channels")
        .upsert(payload, on_conflict="installation_id,slack_channel_id")
        .execute()
    )
    return SlackChannel.model_validate(result.data[0])


def remove_channel(installation_id: str, channel_id: str) -> None:
    """Remove a channel record when the bot is kicked from it.

    Called from the member_left_channel event handler.
    """
    supabase = get_supabase()
    (
        supabase.table("slack_channels")
        .delete()
        .eq("installation_id", installation_id)
        .eq("slack_channel_id", channel_id)
        .execute()
    )
