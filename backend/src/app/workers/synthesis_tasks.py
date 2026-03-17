"""
Passive monitoring synthesis tasks.

Reads event logs from Modal Volume for each provider, reconstructs
conversations/threads, formats events for the learning agent, and calls
the learning agent to update monitored_updates.md and promote durable
facts to long-term context files.

Scheduled via rq-scheduler every 6 hours. See workers/scheduler.py.
"""
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from app.db.supabase_client import get_supabase
from app.agents.context import build_agent_run_payload
from app.agents.learning_agent import run_learning_agent

_LOOKBACK_DAYS = 3
_MONITORED_PROVIDERS = ("slack", "github", "linear")


# ---------------------------------------------------------------------------
# Modal Volume helpers (sync — safe to call inside ThreadPoolExecutor)
# ---------------------------------------------------------------------------

def _vol_read_text(vol, path: str) -> str | None:
    """Read a file from Modal Volume, returning decoded text or None if missing."""
    try:
        chunks = []
        for chunk in vol.read_file(path):
            chunks.append(chunk)
        return b"".join(chunks).decode("utf-8")
    except Exception:
        return None


def _vol_listdir(vol, path: str) -> list:
    """List a directory in Modal Volume, returning entries or [] if missing."""
    try:
        return vol.listdir(path) or []
    except Exception:
        return []


def _read_jsonl_file(vol, path: str) -> list[dict]:
    """Read and parse a JSONL file from Modal Volume."""
    content = _vol_read_text(vol, path)
    if not content:
        return []
    events = []
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return events


# ---------------------------------------------------------------------------
# Event reading
# ---------------------------------------------------------------------------

def _date_range(lookback_days: int) -> list[str]:
    """Return YYYY-MM-DD strings for today and the past (lookback_days - 1) days."""
    today = datetime.now(timezone.utc).date()
    return [(today - timedelta(days=i)).isoformat() for i in range(lookback_days)]


def _parse_ts(ts_str: str) -> datetime:
    return datetime.fromisoformat(ts_str.replace("Z", "+00:00"))


def _read_provider_events(
    provider: str,
    user_id: str,
    last_synthesized_at: datetime | None,
    lookback_days: int = _LOOKBACK_DAYS,
) -> list[dict]:
    """Read all events for a provider from Modal Volume.

    Loads event logs for the past `lookback_days` days, filters to events
    after `last_synthesized_at` (cursor), and for Slack enriches thread
    replies with their parent messages when the parent predates the cursor.
    """
    from app.workspace.modal_sandbox import get_or_create_volume

    vol = get_or_create_volume(user_id)
    dates = _date_range(lookback_days)
    base_path = f"/event_logs/{provider}"
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=lookback_days)

    # List resource directories for this provider
    resource_entries = _vol_listdir(vol, base_path)
    if not resource_entries:
        return []

    # Read all JSONL files within the lookback window
    window_events: list[dict] = []
    for entry in resource_entries:
        resource = entry.path.rstrip("/").split("/")[-1]
        for date_str in dates:
            file_path = f"{base_path}/{resource}/{date_str}.jsonl"
            window_events.extend(_read_jsonl_file(vol, file_path))

    # Filter to the 3-day window
    window_events = [e for e in window_events if _parse_ts(e["ts"]) >= cutoff_dt]

    # Apply cursor — only net-new events
    if last_synthesized_at:
        new_events = [e for e in window_events if _parse_ts(e["ts"]) > last_synthesized_at]
    else:
        new_events = list(window_events)

    if not new_events:
        return []

    # For Slack, ensure thread parents are present even if they predate the cursor
    if provider == "slack":
        new_events = _enrich_slack_threads(new_events, window_events)

    return new_events


def _enrich_slack_threads(
    new_events: list[dict],
    window_events: list[dict],
) -> list[dict]:
    """Ensure Slack thread replies have their parent message in the batch.

    If a reply's parent is not in new_events but exists in the broader
    window_events (already read), prepend the parent with a context note.
    This prevents orphaned replies reaching the LLM without context.
    """
    # Build lookup: slack_ts -> top-level event (from full window)
    top_level_by_ts: dict[str, dict] = {
        e["slack_ts"]: e
        for e in window_events
        if not e.get("is_thread_reply") and e.get("slack_ts")
    }

    new_ts_set = {e.get("slack_ts") for e in new_events}
    parents_to_add: list[dict] = []

    for event in new_events:
        if not event.get("is_thread_reply"):
            continue
        thread_ts = event.get("thread_ts")
        if not thread_ts or thread_ts in new_ts_set:
            continue
        parent = top_level_by_ts.get(thread_ts)
        if parent and parent.get("slack_ts") not in new_ts_set:
            parent_copy = dict(parent)
            parent_copy["_context_note"] = "earlier message providing thread context"
            parents_to_add.append(parent_copy)
            new_ts_set.add(parent["slack_ts"])

    return parents_to_add + new_events


# ---------------------------------------------------------------------------
# Event formatting
# ---------------------------------------------------------------------------

def _fmt_ts(ts_str: str) -> str:
    """Convert ISO timestamp to human-readable: 'Mar 16, 2:32pm'."""
    dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
    return dt.strftime("%b %-d, %-I:%M%p").lower().capitalize()


def _format_slack_events(events: list[dict]) -> str:
    if not events:
        return "(no new Slack activity)"

    # Group by channel
    by_channel: dict[str, list[dict]] = {}
    for e in events:
        channel = e.get("channel_name") or e.get("resource", "unknown")
        by_channel.setdefault(channel, []).append(e)

    sections = []
    for channel, ch_events in by_channel.items():
        top_level = [e for e in ch_events if not e.get("is_thread_reply")]
        replies = [e for e in ch_events if e.get("is_thread_reply")]

        replies_by_thread: dict[str, list[dict]] = {}
        for r in replies:
            tt = r.get("thread_ts", "")
            replies_by_thread.setdefault(tt, []).append(r)

        lines = [f"**#{channel}**"]
        for msg in sorted(top_level, key=lambda e: e["ts"]):
            actor = msg.get("actor_real_name") or msg.get("actor_display_name") or "Unknown"
            note = f" [{msg['_context_note']}]" if msg.get("_context_note") else ""
            text = msg.get("text", "").strip()
            lines.append(f"  {_fmt_ts(msg['ts'])} — **{actor}**{note}: {text}")

            thread_ts = msg.get("slack_ts", "")
            thread_replies = sorted(
                replies_by_thread.get(thread_ts, []), key=lambda e: e["ts"]
            )
            for reply in thread_replies:
                reply_actor = (
                    reply.get("actor_real_name") or reply.get("actor_display_name") or "Unknown"
                )
                lines.append(
                    f"    ↳ {_fmt_ts(reply['ts'])} — **{reply_actor}**: {reply.get('text', '').strip()}"
                )

        sections.append("\n".join(lines))

    return "\n\n".join(sections)


def _format_github_events(events: list[dict]) -> str:
    if not events:
        return "(no new GitHub activity)"

    by_repo: dict[str, list[dict]] = {}
    for e in events:
        repo = e.get("resource", "unknown")
        by_repo.setdefault(repo, []).append(e)

    sections = []
    for repo, repo_events in by_repo.items():
        lines = [f"**{repo}**"]
        for e in sorted(repo_events, key=lambda x: x["ts"]):
            event_type = e.get("type", "")
            actor = e.get("author") or e.get("actor") or "Unknown"
            ts = _fmt_ts(e["ts"])

            if "pull_request" in event_type:
                action = event_type.split(".")[-1] if "." in event_type else event_type
                pr_num = e.get("pr_number", "")
                title = e.get("pr_title", "")
                ref = e.get("raw_ref", "")
                lines.append(f"  {ts} — PR #{pr_num} {action} by {actor}: \"{title}\" {ref}")
            elif event_type == "push":
                branch = e.get("branch", "")
                lines.append(f"  {ts} — Push to {branch} by {actor}")
            else:
                lines.append(f"  {ts} — {event_type} by {actor}")

        sections.append("\n".join(lines))

    return "\n\n".join(sections)


def _format_linear_events(events: list[dict]) -> str:
    if not events:
        return "(no new Linear activity)"

    by_team: dict[str, list[dict]] = {}
    for e in events:
        team = e.get("resource", "unknown")
        by_team.setdefault(team, []).append(e)

    sections = []
    for team, team_events in by_team.items():
        lines = [f"**{team}**"]
        for e in sorted(team_events, key=lambda x: x["ts"]):
            event_type = e.get("type", "")
            actor = e.get("actor") or "Unknown"
            ts = _fmt_ts(e["ts"])
            issue_id = e.get("issue_id", "")
            title = e.get("issue_title", "")

            if event_type == "issue.created":
                lines.append(f"  {ts} — {issue_id} created by {actor}: \"{title}\"")
            elif event_type == "issue.status_changed":
                change = e.get("change") or {}
                status = change.get("status", {})
                from_s = status.get("from") or "?"
                to_s = status.get("to") or "?"
                lines.append(f"  {ts} — {issue_id} \"{title}\" status: {from_s} → {to_s}")
            elif event_type == "comment.created":
                body = e.get("comment_body", "")
                lines.append(f"  {ts} — {actor} commented on {issue_id} \"{title}\": {body}")
            else:
                lines.append(f"  {ts} — {event_type} on {issue_id} \"{title}\" by {actor}")

        sections.append("\n".join(lines))

    return "\n\n".join(sections)


# ---------------------------------------------------------------------------
# Synthesis prompt
# ---------------------------------------------------------------------------

def _build_synthesis_prompt(
    events_by_provider: dict[str, list[dict]],
    existing_content: str | None,
) -> str:
    slack_text = _format_slack_events(events_by_provider.get("slack", []))
    github_text = _format_github_events(events_by_provider.get("github", []))
    linear_text = _format_linear_events(events_by_provider.get("linear", []))

    existing_section = (
        existing_content
        if existing_content
        else "(file does not exist yet — create it fresh)"
    )

    return f"""You are being called by the passive monitoring synthesis job.

Your task: update the agent's working memory based on recent activity from connected integrations.

The current contents of monitored_updates.md are in <existing_monitored_updates> tags below.
New events since the last synthesis are in <new_integration_activity> tags, broken out by provider:
- <slack>: new messages and threads from Slack channels the bot is in
- <github>: new PR and push events from watched GitHub repos
- <linear>: new issue, status change, and comment events from Linear teams

<existing_monitored_updates>
{existing_section}
</existing_monitored_updates>

<new_integration_activity>
<slack>
{slack_text}
</slack>

<github>
{github_text}
</github>

<linear>
{linear_text}
</linear>
</new_integration_activity>

## Instructions

1. Write/update `monitored_updates.md` with the activity above.
   - Do NOT use YAML frontmatter on this file
   - Read the existing file first, then merge — do not blindly overwrite
   - Do not duplicate events already summarized; update status changes in place
   - Remove any entries older than 3 days
   - Structure with provider headers (## Slack, ## GitHub, ## Linear)
   - Write in third person: "Alice commented on...", "A PR was opened..."
   - Use first person only for actions the agent itself took

2. Promote durable facts to long-term context files only when clearly warranted:
   - Key product decision made in a conversation → context/product.md
   - New team member or company detail surfaced → context/company.md
   - Specific facts, tasks, responsibilities, or deadlines that the user has → context/user.md
   - Recurring user preference or working style observed → memory/memory.md
   - Do NOT promote: routine PR activity, individual status updates, transient messages
   - When in doubt, don't promote

Return a brief summary of what you wrote and what (if anything) you promoted."""


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _get_active_integrations(supabase, user_id: str) -> list[dict]:
    """Fetch integrations with monitoring enabled for a user."""
    result = (
        supabase.table("integrations")
        .select("id, provider, last_synthesized_at")
        .eq("user_id", user_id)
        .eq("monitoring_enabled", True)
        .in_("provider", list(_MONITORED_PROVIDERS))
        .execute()
    )
    return result.data or []


def _update_last_synthesized_at(supabase, integration_ids: list[str], now: str) -> None:
    if not integration_ids:
        return
    supabase.table("integrations").update(
        {"last_synthesized_at": now}
    ).in_("id", integration_ids).execute()


# ---------------------------------------------------------------------------
# Main RQ task
# ---------------------------------------------------------------------------

def synthesize_monitored_updates(user_id: str):
    """RQ task: synthesize event logs into monitored_updates.md.

    Reads new events from Modal Volume for each active provider in parallel,
    formats them, and calls the learning agent to update the agent's working
    memory. Runs every 6 hours per active user via rq-scheduler.
    """
    print(f"[synthesis] starting for user {user_id}", flush=True)

    async def _run():
        from app.config import settings

        supabase = get_supabase()

        # Check global monitoring flag
        user_row = (
            supabase.table("users")
            .select("enable_agent_monitoring")
            .eq("id", user_id)
            .single()
            .execute()
        )
        if user_row.data and not user_row.data.get("enable_agent_monitoring", True):
            print(f"[synthesis] monitoring disabled for user {user_id} — skipping", flush=True)
            return

        integrations = _get_active_integrations(supabase, user_id)
        if not integrations:
            print(f"[synthesis] no active monitored integrations for {user_id} — skipping", flush=True)
            return

        if settings.workspace_backend != "production":
            print(f"[synthesis] local mode — skipping Modal Volume reads", flush=True)
            return

        # Build cursor map: provider -> last_synthesized_at datetime
        last_synthesized: dict[str, datetime | None] = {}
        integration_ids: list[str] = []
        for intg in integrations:
            provider = intg["provider"]
            raw_ts = intg.get("last_synthesized_at")
            last_synthesized[provider] = (
                _parse_ts(raw_ts) if raw_ts else None
            )
            integration_ids.append(str(intg["id"]))

        # Parallel sync reads via ThreadPoolExecutor
        def _read(provider: str) -> list[dict]:
            return _read_provider_events(
                provider,
                user_id,
                last_synthesized_at=last_synthesized.get(provider),
            )

        events_by_provider: dict[str, list[dict]] = {}
        with ThreadPoolExecutor(max_workers=len(integrations)) as executor:
            futures = {
                intg["provider"]: executor.submit(_read, intg["provider"])
                for intg in integrations
            }
            for provider, future in futures.items():
                try:
                    events_by_provider[provider] = future.result()
                except Exception as e:
                    print(f"[synthesis] error reading {provider} events: {e}", flush=True)
                    events_by_provider[provider] = []

        total_events = sum(len(v) for v in events_by_provider.values())
        if total_events == 0:
            print(f"[synthesis] no new events for user {user_id} — skipping LLM call", flush=True)
            return

        print(f"[synthesis] {total_events} new events for user {user_id}", flush=True)

        from app.workspace.modal_sandbox import get_or_create_volume
        vol = get_or_create_volume(user_id)
        existing_content = await asyncio.to_thread(_vol_read_text, vol, "/monitored_updates.md")

        # Build payload and call learning agent
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")
        prompt = _build_synthesis_prompt(events_by_provider, existing_content)
        await run_learning_agent(payload, prompt)

        # Advance cursors
        now = datetime.now(timezone.utc).isoformat()
        _update_last_synthesized_at(supabase, integration_ids, now)

        print(f"[synthesis] completed for user {user_id}", flush=True)

    try:
        asyncio.run(_run())
    except Exception as e:
        print(f"[synthesis] ERROR for user {user_id}: {type(e).__name__}: {e}", flush=True)
        raise
