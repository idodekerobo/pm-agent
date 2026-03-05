"""Dispatcher for the tool_slack agent tool.

Receives structured parameters from tool_slack, handles all DB lookups and
validation, then delegates to the appropriate client.py function. tools.py
knows nothing about Slack internals — that boundary lives here.

Layers:
    agents/tools.py → tool_slack(action_type, channel, ...)
        └── messaging/slack/dispatcher.py → dispatch_slack_action(ctx, ...)
                └── messaging/slack/client.py → post_message() / send_dm() etc.
                        └── Slack Web API
"""

import asyncio
from typing import Optional

from app.agents.context import AgentContext
from app.errors import log_error
from app.messaging.slack.client import list_channels, post_message, send_dm
from app.messaging.slack.installation_store import get_installation_by_user_id
from app.schemas.slack import SlackInstallation


async def dispatch_slack_action(
    ctx: AgentContext,
    action_type: str,
    message: Optional[str] = None,
    reply_in_thread: Optional[bool] = None,
    channel: Optional[str] = None,
    thread_ts: Optional[str] = None,
    slack_user_id: Optional[str] = None,
) -> str:
    """Route a tool_slack call to the correct Slack Web API operation.

    Args:
        ctx: The agent's run context (provides user_id for installation lookup).
        action_type: One of "reply", "post_message", "post_reply", or "send_dm".
        message: Text body to send.
        reply_in_thread: For action_type="reply" — True posts in thread, False posts in channel.
        channel: Channel name (e.g. "general") for post_message / post_reply.
        thread_ts: Parent message timestamp — required for post_reply.
        slack_user_id: Slack user ID — required for send_dm.

    Returns:
        A human-readable result string the agent can relay to the user.
    """
    installation = get_installation_by_user_id(ctx.user_id)
    if not installation:
        asyncio.create_task(log_error(
            ctx.user_id, "agent",
            Exception("Slack installation not found"),
            context={"origin": "agent_tool", "tool": "tool_slack", "action_type": action_type,
                     "error_category": "infrastructure"},
        ))
        return (
            "Slack is not connected for this account. "
            "Ask the user to install the Slack app from the integrations settings page."
        )

    bot_token = installation.bot_token  # already decrypted by installation_store

    _missing_params_ctx = {"origin": "agent_tool", "tool": "tool_slack",
                           "action_type": action_type, "error_category": "missing_params"}

    if action_type == "reply":
        if not message:
            asyncio.create_task(log_error(ctx.user_id, "agent",
                Exception("tool_slack reply called without 'message'"), context=_missing_params_ctx))
            return "reply requires 'message'."
        if reply_in_thread is None:
            asyncio.create_task(log_error(ctx.user_id, "agent",
                Exception("tool_slack reply called without 'reply_in_thread'"), context=_missing_params_ctx))
            return "reply requires 'reply_in_thread' (True or False)."
        mention_ctx = ctx.slack_mention_context
        if not mention_ctx:
            asyncio.create_task(log_error(ctx.user_id, "agent",
                Exception("tool_slack reply called outside of a Slack mention context"), context=_missing_params_ctx))
            return "reply can only be used when responding to a Slack @-mention."
        post_thread_ts = mention_ctx["thread_ts"] if reply_in_thread else None
        await post_message(bot_token, mention_ctx["channel_id"], message, thread_ts=post_thread_ts)
        ctx.slack_mention_replied = True
        placement = "in thread" if reply_in_thread else "in channel"
        return f"Replied {placement} successfully."

    elif action_type == "post_message":
        if not channel or not message:
            asyncio.create_task(log_error(ctx.user_id, "agent",
                Exception("tool_slack post_message called without 'channel' or 'message'"), context=_missing_params_ctx))
            return "post_message requires both 'channel' and 'message'."
        channel_id = await _resolve_channel(str(installation.id), channel, bot_token)
        if channel_id is None:
            asyncio.create_task(log_error(
                ctx.user_id, "agent",
                Exception(f"Channel #{channel} not accessible"),
                context={"origin": "agent_tool", "tool": "tool_slack", "action_type": action_type,
                         "channel": channel, "error_category": "infrastructure"},
            ))
            return (
                f"Channel #{channel} is not accessible. "
                f"Make sure @PM Agent has been added to #{channel} in Slack first."
            )
        await post_message(bot_token, channel_id, message)
        return f"Posted to #{channel} successfully."

    elif action_type == "post_reply":
        if not channel or not message or not thread_ts:
            asyncio.create_task(log_error(ctx.user_id, "agent",
                Exception("tool_slack post_reply called without 'channel', 'message', or 'thread_ts'"), context=_missing_params_ctx))
            return "post_reply requires 'channel', 'message', and 'thread_ts'."
        channel_id = await _resolve_channel(str(installation.id), channel, bot_token)
        if channel_id is None:
            asyncio.create_task(log_error(
                ctx.user_id, "agent",
                Exception(f"Channel #{channel} not accessible"),
                context={"origin": "agent_tool", "tool": "tool_slack", "action_type": action_type,
                         "channel": channel, "error_category": "infrastructure"},
            ))
            return (
                f"Channel #{channel} is not accessible. "
                f"Make sure @PM Agent has been added to #{channel} in Slack first."
            )
        await post_message(bot_token, channel_id, message, thread_ts=thread_ts)
        return f"Replied in thread in #{channel} successfully."

    elif action_type == "send_dm":
        if not slack_user_id or not message:
            asyncio.create_task(log_error(ctx.user_id, "agent",
                Exception("tool_slack send_dm called without 'slack_user_id' or 'message'"), context=_missing_params_ctx))
            return "send_dm requires both 'slack_user_id' and 'message'."
        await send_dm(bot_token, slack_user_id, message)
        return f"Sent DM to Slack user {slack_user_id} successfully."

    else:
        asyncio.create_task(log_error(ctx.user_id, "agent",
            Exception(f"tool_slack called with unknown action_type '{action_type}'"),
            context={**_missing_params_ctx, "error_category": "missing_params"},
        ))
        return (
            f"Unknown action_type '{action_type}'. "
            f"Valid options: reply, post_message, post_reply, send_dm."
        )


async def _resolve_channel(installation_id: str, channel_name: str, bot_token: str) -> str | None:
    """Resolve a human-readable channel name to a Slack channel ID.

    First checks the slack_channels table (fast, no API call). Falls back to
    the Slack API if the DB lookup returns nothing — this handles rows where
    slack_channel_name is null (member_joined_channel events don't always
    include the channel name).

    Returns None if the channel can't be found or the bot hasn't been added.
    """
    from app.db.supabase_client import get_supabase

    supabase = get_supabase()
    result = (
        supabase.table("slack_channels")
        .select("slack_channel_id, is_enabled")
        .eq("installation_id", installation_id)
        .ilike("slack_channel_name", channel_name)
        .maybe_single()
        .execute()
    )

    if result is not None and result.data:
        if not result.data["is_enabled"]:
            return None
        return result.data["slack_channel_id"]

    # DB lookup missed — channel may be registered with a null name.
    # Fall back to the Slack API to resolve name → ID.
    api_channels = await list_channels(bot_token)
    for ch in api_channels:
        if ch.get("name", "").lower() == channel_name.lower():
            return ch["id"]

    return None
