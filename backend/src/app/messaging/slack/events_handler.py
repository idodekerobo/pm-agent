"""Routes incoming Slack event payloads to the appropriate handler functions.

Called from the handle_slack_message RQ task after the route has already
verified the Slack signature and ACK'd the 200 response.
"""

import re

from app.messaging.slack.client import (
    add_reaction,
    get_channel_history,
    get_thread_history,
    list_channels,
    post_message,
    remove_reaction,
)
from app.messaging.slack.installation_store import remove_channel, upsert_channel
from app.schemas.slack import SlackInstallation

# Compaction thresholds
_MAX_THREAD_MESSAGES = 30
_VERBATIM_THREAD_TAIL = 20
_CHANNEL_HISTORY_LIMIT = 30


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

async def dispatch_event(event_payload: dict, installation: SlackInstallation) -> None:
    """Route a Slack event payload to the correct handler.

    This is the entry point called from the RQ task. The installation dict
    must already have bot_token decrypted (as returned by installation_store).
    """
    event = event_payload.get("event", {})
    event_type = event.get("type")

    if event_type == "app_mention":
        print("calling handle_app_mention")
        await handle_app_mention(event, installation)

    elif event_type == "message" and event.get("channel_type") == "im":
        print("calling handle_im_message")
        await handle_im_message(event, installation)

    elif event_type == "member_joined_channel":
        await handle_member_joined_channel(event, installation)

    elif event_type == "member_left_channel":
        handle_member_left_channel(event, installation)

    elif event_type in ("app_uninstalled", "tokens_revoked"):
        _handle_revocation(event_payload, installation)

    else:
        print(f"[slack] unhandled event type: {event_type!r}", flush=True)


# ---------------------------------------------------------------------------
# Mention + DM handlers
# ---------------------------------------------------------------------------

async def handle_app_mention(event: dict, installation: SlackInstallation) -> None:
    """Handle an app_mention event (someone @-mentioned the bot in a channel).

    Always fetches the last _CHANNEL_HISTORY_LIMIT channel messages for broad
    context. When the mention is inside an existing thread, also fetches the
    full thread history and merges it (deduplicating by ts so the thread parent
    doesn't appear twice). Both are passed to the orchestrator as input_items.
    """
    bot_token = installation.bot_token
    bot_user_id = installation.slack_bot_user_id
    channel = event["channel"]
    ts = event["ts"]
    is_in_thread = bool(event.get("thread_ts"))
    thread_ts = event.get("thread_ts")  # None for top-level mentions

    prompt_text = _strip_bot_mention(event.get("text", ""), bot_user_id)

    # Always fetch recent channel history for broad context
    raw_channel = await get_channel_history(bot_token, channel, limit=_CHANNEL_HISTORY_LIMIT)

    # Fetch thread history if this mention is inside an existing thread
    raw_thread: list[dict] = []
    if is_in_thread:
        raw_thread = await get_thread_history(bot_token, channel, thread_ts)

    # Build the combined context history, excluding the triggering message (ts)
    # since it is captured separately as prompt_text / user_item below.
    context_history = _build_combined_history(
        raw_channel, raw_thread, bot_user_id, exclude_ts=ts
    )

    await _run_agent_for_message(
        channel=channel,
        ts=ts,
        thread_ts=thread_ts,
        is_in_thread=is_in_thread,
        is_mention=True,
        prompt_text=prompt_text,
        context_history=context_history,
        installation=installation,
        slack_user_id=event["user"],
    )


async def handle_im_message(event: dict, installation: SlackInstallation) -> None:
    """Handle a direct message to the bot.

    Guards against the bot replying to its own messages (infinite loop
    prevention) and ignores empty or bot-originated messages.
    """
    bot_user_id = installation.slack_bot_user_id
    channel = event["channel"]
    ts = event["ts"]

    # Ignore messages the bot itself sent
    if event.get("user") == bot_user_id or event.get("bot_id"):
        return

    prompt_text = event.get("text", "").strip()
    if not prompt_text:
        return

    await _run_agent_for_message(
        channel=channel,
        ts=ts,
        thread_ts=ts,  # DMs: thread reply on the original message
        is_in_thread=False,
        is_mention=False,
        prompt_text=prompt_text,
        context_history=None,
        installation=installation,
        slack_user_id=event["user"],
    )


# ---------------------------------------------------------------------------
# Channel membership handlers
# ---------------------------------------------------------------------------

async def handle_member_joined_channel(event: dict, installation: SlackInstallation) -> None:
    """Auto-register a channel when the bot is added to it.

    Only acts on events where the bot user itself joined — not when other
    users join a channel the bot is already in.

    member_joined_channel events don't always include channel_name, so we fall
    back to the Slack API (conversations.list) to resolve the name when missing.
    """
    if event.get("user") != installation.slack_bot_user_id:
        return

    channel_id = event["channel"]
    channel_name = event.get("channel_name")

    if not channel_name:
        channels = await list_channels(installation.bot_token)
        match = next((ch for ch in channels if ch["id"] == channel_id), None)
        if match:
            channel_name = match.get("name")

    upsert_channel(
        installation_id=str(installation.id),
        channel_id=channel_id,
        channel_name=channel_name,
    )
    print(f"[slack] bot joined channel {channel_id!r} ({channel_name!r}) — registered in DB", flush=True)


def handle_member_left_channel(event: dict, installation: SlackInstallation) -> None:
    """Auto-remove a channel record when the bot is kicked from it."""
    if event.get("user") != installation.slack_bot_user_id:
        return
    remove_channel(
        installation_id=str(installation.id),
        channel_id=event["channel"],
    )
    print(f"[slack] bot left channel {event['channel']!r} — removed from DB", flush=True)


# ---------------------------------------------------------------------------
# Revocation handler
# ---------------------------------------------------------------------------

def _handle_revocation(event_payload: dict, installation: SlackInstallation) -> None:
    """Delete the installation record on app_uninstalled or tokens_revoked.

    CASCADE on the FK means all associated slack_channels rows are also deleted.
    """
    from app.db.supabase_client import get_supabase

    event_type = event_payload.get("event", {}).get("type")
    supabase = get_supabase()
    supabase.table("slack_installations").delete().eq("id", str(installation.id)).execute()
    print(f"[slack] installation {installation.id} removed — reason: {event_type!r}", flush=True)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

async def _run_agent_for_message(
    *,
    channel: str,
    ts: str,
    thread_ts: str | None,
    is_in_thread: bool,
    is_mention: bool,
    prompt_text: str,
    context_history: list[dict] | None,
    installation: SlackInstallation,
    slack_user_id: str,
) -> None:
    """Core orchestrator flow shared by handle_app_mention and handle_im_message.

    Both paths prepend an ephemeral system context item (platform, current time in the
    user's timezone) to input_items every turn. This item is never saved to the DB.

    For @-mentions (is_mention=True):
    1. Add :hourglass_flowing_sand: reaction
    2. Prepend system context item (includes tool_slack instructions)
    3. Run the orchestrator — the agent decides to call tool_slack(action_type="reply")
       with reply_in_thread=True/False to control placement
    4. Fallback: if the agent didn't call tool_slack, post final_output in the channel
    5. Save conversation items + remove reaction

    For DMs (is_mention=False):
    1. Prepend system context item
    2. Run the orchestrator
    3. Auto-post final_output as a thread reply
    """
    from app.agents.context import build_agent_run_payload
    from app.agents.orchestrator_agent import run_orchestrator
    from app.db.agent_sessions import find_session_by_thread_id
    from app.db.conversations import append_conversation_item, make_user_item, make_assistant_item
    from app.db.supabase_client import get_supabase
    from app.db.workspaces import set_workspace_agent_run_status

    bot_token = installation.bot_token
    user_id = str(installation.user_id)

    supabase = get_supabase()
    if is_mention:
        external_thread_id = f"{channel}:{thread_ts or ts}"
        existing_session_id = find_session_by_thread_id(
            supabase,
            user_id=user_id,
            session_start_platform="slack",
            external_thread_id=external_thread_id,
        )
    else:
        external_thread_id = f"dm:{channel}"
        existing_session_id = find_session_by_thread_id(
            supabase,
            user_id=user_id,
            session_start_platform="slack",
            external_thread_id=external_thread_id,
            max_age_hours=36,
        )

    workspace_id_to_reset: str | None = None
    await add_reaction(bot_token, channel, ts, "hourglass_flowing_sand")
    try:
        payload = build_agent_run_payload(
            supabase,
            user_id,
            agent_session_id=existing_session_id,
            session_start_platform="slack",
            external_thread_id=external_thread_id,
            slack_mention_context={
                "channel_id": channel,
                "ts": ts,
                "thread_ts": thread_ts,
                "is_in_thread": is_in_thread,
            } if is_mention else None,
        )
        workspace_id_to_reset = str(payload.workspace_id)
        set_workspace_agent_run_status(supabase, workspace_id=workspace_id_to_reset, status="running")

        user_item = make_user_item(prompt_text)

        # Fetch user timezone — cheap call, gives always-current time in user's tz
        user_info: dict = {}
        try:
            from app.messaging.slack.client import get_user_info
            user_info = await get_user_info(bot_token, slack_user_id)
        except Exception:
            pass  # non-fatal — falls back to UTC

        system_context_item = _build_slack_system_item(
            user_info, channel, is_mention
        )
        input_items = [system_context_item] + (context_history or []) + [user_item]

        user_item_id = append_conversation_item(
            supabase,
            agent_session_id=payload.agent_session_id,
            item=user_item,
            llm_input_context=input_items,
            source_platform="slack",
            source_channel_id=channel,
        )

        final_output = ""
        async for chunk in run_orchestrator(
            input_items=input_items,
            payload=payload,
        ):
            if chunk["type"] == "final_output":
                final_output = chunk["content"]

        if is_mention:
            # Fallback: if the agent produced output but didn't call tool_slack,
            # post final_output directly in the channel.
            if not payload.agent_context.slack_mention_replied and final_output:
                print(
                    "[slack] agent did not call tool_slack reply — falling back to channel post",
                    flush=True,
                )
                await post_message(bot_token, channel, final_output)
        else:
            # DMs: always auto-post the final_output as a thread reply
            if final_output:
                await post_message(bot_token, channel, final_output, thread_ts=thread_ts)

        if final_output:
            append_conversation_item(
                supabase,
                agent_session_id=payload.agent_session_id,
                item=make_assistant_item(final_output),
                parent_id=user_item_id,
                source_platform="slack",
                source_channel_id=channel,
            )

    finally:
        if workspace_id_to_reset:
            set_workspace_agent_run_status(supabase, workspace_id=workspace_id_to_reset, status="idle")
        await remove_reaction(bot_token, channel, ts, "hourglass_flowing_sand")


def _strip_bot_mention(text: str, bot_user_id: str) -> str:
    """Remove <@BOT_USER_ID> mentions from message text."""
    return re.sub(rf"<@{re.escape(bot_user_id)}>", "", text).strip()


def _build_conversation_history(messages: list[dict], bot_user_id: str) -> list[dict]:
    """Map a flat list of Slack messages to orchestrator conversation items.

    - Messages from the bot → role "assistant"
    - Messages from humans → role "user"
    - Strips @BOT_USER_ID mentions from all text
    - Compacts lists longer than _MAX_THREAD_MESSAGES to the most recent tail
    """
    if len(messages) > _MAX_THREAD_MESSAGES:
        messages = messages[-_VERBATIM_THREAD_TAIL:]

    items = []
    for msg in messages:
        text = _strip_bot_mention(msg.get("text", ""), bot_user_id)
        role = "assistant" if msg.get("user") == bot_user_id else "user"
        # OpenAI Responses API requires "output_text" for assistant messages
        # and "input_text" for user messages.
        content_type = "output_text" if role == "assistant" else "input_text"
        items.append({
            "type": "message",
            "role": role,
            "content": [{"type": content_type, "text": text}],
        })
    return items

def _build_slack_system_item(
    user_info: dict,
    channel: str,
    is_mention: bool,
) -> dict:
    """Build an ephemeral system context item with platform, current time, and tool instructions.

    Never saved to DB — prepended to input_items on every Slack turn.
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    tz_name = user_info.get("tz") or "UTC"
    tz_label = user_info.get("tz_label") or tz_name
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError):
        tz = ZoneInfo("UTC")

    now = datetime.now(tz)
    time_str = now.strftime("%A, %B %-d %Y, %I:%M %p") + f" ({tz_label})"

    if is_mention:
        platform = f"Slack channel {channel}"
        tool_instructions = (
            "\nUse tool_slack with action_type=\"reply\" to post your response. "
            "Set reply_in_thread=True to reply inside the thread, or reply_in_thread=False "
            "to post directly in the channel. Only omit calling tool_slack if no reply is needed."
        )
    else:
        platform = f"Slack DM (channel: {channel})"
        tool_instructions = ""

    text = f"[Session Context]\nPlatform: {platform}\nTime: {time_str}{tool_instructions}"
    return {"type": "message", "role": "system", "content": [{"type": "input_text", "text": text}]}


# TODO: prefix the thread messages so the llm will know what messages are from channel and what is from the thread
# TODO: see if its possible to send timestamps for each message so the the llm has that context
def _build_combined_history(
    channel_msgs: list[dict],
    thread_msgs: list[dict],
    bot_user_id: str,
    exclude_ts: str,
) -> list[dict]:
    """Merge channel history and thread history into a single ordered context list.

    Strategy:
    - Channel messages provide broad conversational context (oldest first).
    - Thread messages provide the specific thread context (oldest first).
    - The thread parent message appears in both lists — deduplicate by ts.
    - The triggering mention (exclude_ts) is excluded from both since it is
      passed separately as the user_item in input_items.

    Returns a chronologically ordered list of orchestrator conversation items.
    """
    seen_ts: set[str] = {exclude_ts}
    merged: list[dict] = []

    # Channel messages first (broad context)
    for msg in channel_msgs:
        msg_ts = msg.get("ts", "")
        if msg_ts in seen_ts:
            continue
        seen_ts.add(msg_ts)
        merged.append(msg)

    # Thread messages next — the parent ts may already be in seen_ts from
    # channel history, so it won't be added again.
    for msg in thread_msgs:
        msg_ts = msg.get("ts", "")
        if msg_ts in seen_ts:
            continue
        seen_ts.add(msg_ts)
        merged.append(msg)

    return _build_conversation_history(merged, bot_user_id)
