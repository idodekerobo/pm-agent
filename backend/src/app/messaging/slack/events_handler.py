"""Routes incoming Slack event payloads to the appropriate handler functions.

Called from the handle_slack_message RQ task after the route has already
verified the Slack signature and ACK'd the 200 response.
"""

import re

from app.messaging.slack.client import (
    add_reaction,
    get_thread_history,
    post_message,
    remove_reaction,
)
from app.messaging.slack.installation_store import remove_channel, upsert_channel

# Thread compaction thresholds (per plan)
_MAX_THREAD_MESSAGES = 30
_VERBATIM_THREAD_TAIL = 20


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

async def dispatch_event(event_payload: dict, installation: dict) -> None:
    """Route a Slack event payload to the correct handler.

    This is the entry point called from the RQ task. The installation dict
    must already have bot_token decrypted (as returned by installation_store).
    """
    event = event_payload.get("event", {})
    event_type = event.get("type")

    if event_type == "app_mention":
        await handle_app_mention(event, installation)

    elif event_type == "message" and event.get("channel_type") == "im":
        await handle_im_message(event, installation)

    elif event_type == "member_joined_channel":
        handle_member_joined_channel(event, installation)

    elif event_type == "member_left_channel":
        handle_member_left_channel(event, installation)

    elif event_type in ("app_uninstalled", "tokens_revoked"):
        _handle_revocation(event_payload, installation)

    else:
        print(f"[slack] unhandled event type: {event_type!r}", flush=True)


# ---------------------------------------------------------------------------
# Mention + DM handlers
# ---------------------------------------------------------------------------

async def handle_app_mention(event: dict, installation: dict) -> None:
    """Handle an app_mention event (someone @-mentioned the bot in a channel).

    If the mention is inside an existing thread, the full thread history is
    fetched and passed to the orchestrator as conversation context. Top-level
    mentions start a new thread rooted at the triggering message.
    """
    bot_token = installation["bot_token"]
    bot_user_id = installation["slack_bot_user_id"]
    channel = event["channel"]
    ts = event["ts"]
    thread_ts = event.get("thread_ts", ts)

    prompt_text = _strip_bot_mention(event.get("text", ""), bot_user_id)

    # Load thread history when this mention is a reply inside an existing thread
    thread_history: list[dict] | None = None
    if event.get("thread_ts"):
        raw_thread = await get_thread_history(bot_token, channel, thread_ts)
        all_items = _build_conversation_history(raw_thread, bot_user_id)
        # The triggering message is already captured as prompt_text — exclude
        # it from history to avoid duplication.
        thread_history = all_items[:-1] if all_items else None

    await _run_agent_for_message(
        channel=channel,
        ts=ts,
        thread_ts=thread_ts,
        prompt_text=prompt_text,
        thread_history=thread_history,
        installation=installation,
    )


async def handle_im_message(event: dict, installation: dict) -> None:
    """Handle a direct message to the bot.

    Guards against the bot replying to its own messages (infinite loop
    prevention) and ignores empty or bot-originated messages.
    """
    bot_user_id = installation["slack_bot_user_id"]
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
        prompt_text=prompt_text,
        thread_history=None,
        installation=installation,
    )


# ---------------------------------------------------------------------------
# Channel membership handlers
# ---------------------------------------------------------------------------

def handle_member_joined_channel(event: dict, installation: dict) -> None:
    """Auto-register a channel when the bot is added to it.

    Only acts on events where the bot user itself joined — not when other
    users join a channel the bot is already in.
    """
    if event.get("user") != installation["slack_bot_user_id"]:
        return
    upsert_channel(
        installation_id=installation["id"],
        channel_id=event["channel"],
        channel_name=event.get("channel_name"),
    )
    print(f"[slack] bot joined channel {event['channel']!r} — registered in DB", flush=True)


def handle_member_left_channel(event: dict, installation: dict) -> None:
    """Auto-remove a channel record when the bot is kicked from it."""
    if event.get("user") != installation["slack_bot_user_id"]:
        return
    remove_channel(
        installation_id=installation["id"],
        channel_id=event["channel"],
    )
    print(f"[slack] bot left channel {event['channel']!r} — removed from DB", flush=True)


# ---------------------------------------------------------------------------
# Revocation handler
# ---------------------------------------------------------------------------

def _handle_revocation(event_payload: dict, installation: dict) -> None:
    """Delete the installation record on app_uninstalled or tokens_revoked.

    CASCADE on the FK means all associated slack_channels rows are also deleted.
    """
    from app.db.supabase_client import get_supabase

    event_type = event_payload.get("event", {}).get("type")
    supabase = get_supabase()
    supabase.table("slack_installations").delete().eq("id", installation["id"]).execute()
    print(f"[slack] installation {installation['id']} removed — reason: {event_type!r}", flush=True)


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

async def _run_agent_for_message(
    *,
    channel: str,
    ts: str,
    thread_ts: str,
    prompt_text: str,
    thread_history: list[dict] | None,
    installation: dict,
) -> None:
    """Core orchestrator flow shared by handle_app_mention and handle_im_message.

    1. Add :hourglass_flowing_sand: reaction to the triggering message
    2. Set up agent session context
    3. Run the orchestrator with thread history + current prompt
    4. Post the reply in the same Slack thread
    5. Save user + assistant conversation items (source_platform='slack')
    6. Remove :hourglass_flowing_sand: reaction (always, even on error)
    """
    # Defer heavy imports — these won't be needed for channel management events
    from app.agents.orchestrator import run_orchestrator
    from app.db.agent_sessions import get_or_create_agent_session
    from app.db.conversations import append_conversation_item
    from app.db.projects import get_or_create_default_project
    from app.db.supabase_client import get_supabase
    from app.db.workspaces import get_workspace

    bot_token = installation["bot_token"]
    user_id = installation["user_id"]

    await add_reaction(bot_token, channel, ts, "hourglass_flowing_sand")
    try:
        supabase = get_supabase()

        user_row = (
            supabase.table("users")
            .select("organization_id")
            .eq("id", user_id)
            .single()
            .execute()
        )
        if not user_row.data:
            raise ValueError(f"User {user_id} not found in DB")

        organization_id = user_row.data.get("organization_id") or "local"

        project_id, _ = get_or_create_default_project(
            supabase,
            organization_id=organization_id,
            user_id=user_id,
        )
        agent_session_id, workspace_id = get_or_create_agent_session(
            supabase,
            organization_id=organization_id,
            user_id=user_id,
            project_id=project_id,
            agent_session_id=None,
        )
        workspace_row = get_workspace(supabase, workspace_id=workspace_id)
        sandbox_id = workspace_row.get("last_sandbox_id")

        user_item: dict = {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": prompt_text}],
        }
        input_items = (thread_history or []) + [user_item]

        user_item_id = append_conversation_item(
            supabase,
            agent_session_id=agent_session_id,
            item=user_item,
            source_platform="slack",
            source_channel_id=channel,
        )

        final_output = ""
        async for chunk in run_orchestrator(
            input_items=input_items,
            organization_id=organization_id,
            user_id=user_id,
            agent_session_id=agent_session_id,
            workspace_id=workspace_id,
            sandbox_id=sandbox_id,
        ):
            if chunk["type"] == "final_output":
                final_output = chunk["content"]

        if final_output:
            await post_message(bot_token, channel, final_output, thread_ts=thread_ts)
            assistant_item: dict = {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "input_text", "text": final_output}],
            }
            append_conversation_item(
                supabase,
                agent_session_id=agent_session_id,
                item=assistant_item,
                parent_id=user_item_id,
                source_platform="slack",
                source_channel_id=channel,
            )

    finally:
        await remove_reaction(bot_token, channel, ts, "hourglass_flowing_sand")


def _strip_bot_mention(text: str, bot_user_id: str) -> str:
    """Remove <@BOT_USER_ID> mentions from message text."""
    return re.sub(rf"<@{re.escape(bot_user_id)}>", "", text).strip()


def _build_conversation_history(messages: list[dict], bot_user_id: str) -> list[dict]:
    """Map Slack thread messages to orchestrator conversation items.

    - Messages from the bot → role "assistant"
    - Messages from humans → role "user"
    - Strips @BOT_USER_ID mentions from all text
    - Compacts threads longer than _MAX_THREAD_MESSAGES by keeping only
      the most recent _VERBATIM_THREAD_TAIL messages
    """
    if len(messages) > _MAX_THREAD_MESSAGES:
        messages = messages[-_VERBATIM_THREAD_TAIL:]

    items = []
    for msg in messages:
        text = _strip_bot_mention(msg.get("text", ""), bot_user_id)
        role = "assistant" if msg.get("user") == bot_user_id else "user"
        items.append({
            "type": "message",
            "role": role,
            "content": [{"type": "input_text", "text": text}],
        })
    return items
