"""Thin async wrapper around the Slack Web API.

Each function accepts a bot_token directly so callers can use whichever
workspace's token is appropriate. A fresh AsyncWebClient is created per
call — this is cheap and avoids any shared-state issues across workspaces.
"""

from slack_sdk.web.async_client import AsyncWebClient
from slack_sdk.errors import SlackApiError


async def post_message(
    bot_token: str,
    channel: str,
    text: str,
    thread_ts: str | None = None,
) -> dict:
    """Post a message to a channel, optionally inside a thread.

    Args:
        bot_token: Decrypted xoxb- bot token for the workspace.
        channel: Slack channel ID (e.g. 'C0123ABCD').
        text: Message body.
        thread_ts: Timestamp of the parent message to reply in-thread.

    Returns:
        The Slack API response data dict.

    Raises:
        SlackApiError: If the Slack API returns an error.
    """
    client = AsyncWebClient(token=bot_token)
    kwargs: dict = {"channel": channel, "text": text}
    if thread_ts:
        kwargs["thread_ts"] = thread_ts
    response = await client.chat_postMessage(**kwargs)
    return response.data


async def add_reaction(
    bot_token: str,
    channel: str,
    timestamp: str,
    emoji: str,
) -> None:
    """Add an emoji reaction to a message.

    Args:
        bot_token: Decrypted xoxb- bot token.
        channel: Slack channel ID containing the message.
        timestamp: The message timestamp (ts field from the event).
        emoji: Emoji name without colons (e.g. 'hourglass_flowing_sand').
    """
    client = AsyncWebClient(token=bot_token)
    try:
        await client.reactions_add(channel=channel, timestamp=timestamp, name=emoji)
    except SlackApiError as e:
        # 'already_reacted' is benign — ignore it, surface everything else
        if e.response.get("error") != "already_reacted":
            raise


async def remove_reaction(
    bot_token: str,
    channel: str,
    timestamp: str,
    emoji: str,
) -> None:
    """Remove an emoji reaction from a message.

    Args:
        bot_token: Decrypted xoxb- bot token.
        channel: Slack channel ID containing the message.
        timestamp: The message timestamp.
        emoji: Emoji name without colons.
    """
    client = AsyncWebClient(token=bot_token)
    try:
        await client.reactions_remove(channel=channel, timestamp=timestamp, name=emoji)
    except SlackApiError as e:
        # 'no_reaction' means it was already removed — ignore it
        if e.response.get("error") != "no_reaction":
            raise


async def get_thread_history(
    bot_token: str,
    channel: str,
    thread_ts: str,
) -> list[dict]:
    """Fetch all messages in a thread.

    Handles cursor-based pagination so the full thread is returned regardless
    of length.

    Args:
        bot_token: Decrypted xoxb- bot token.
        channel: Slack channel ID.
        thread_ts: Timestamp of the root (parent) message of the thread.

    Returns:
        List of Slack message dicts in chronological order.
    """
    client = AsyncWebClient(token=bot_token)
    messages: list[dict] = []
    cursor: str | None = None

    while True:
        kwargs: dict = {"channel": channel, "ts": thread_ts}
        if cursor:
            kwargs["cursor"] = cursor

        response = await client.conversations_replies(**kwargs)
        messages.extend(response.data.get("messages", []))

        next_cursor = response.data.get("response_metadata", {}).get("next_cursor")
        if not next_cursor:
            break
        cursor = next_cursor

    return messages
