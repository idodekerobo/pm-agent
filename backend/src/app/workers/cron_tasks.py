"""
Scheduled (cron-triggered) RQ tasks.

These functions are NOT called directly by application code. They are
enqueued by the rq-scheduler process on a timer. See workers/scheduler.py.

Contrast with tasks.py, which contains event-driven tasks triggered by
application code (e.g. after OAuth callbacks).
"""
from datetime import datetime, timedelta, timezone

from app.db.supabase_client import get_supabase
from app.workers.queue import get_queue


# ---------------------------------------------------------------------------
# summarize_session
# ---------------------------------------------------------------------------

def summarize_session(agent_session_id: str, user_id: str):
    """Generate and store a GPT-4o-mini summary for a single agent session.

    Fetches the session's conversation items, builds a plain-text transcript,
    and calls the OpenAI API to produce a 2-3 sentence summary. Writes the
    result back to agent_sessions.summary and agent_sessions.last_summary_at.

    Skips sessions with fewer than 2 user turns — not worth summarizing.
    """
    from app.db.conversations import get_conversation_items
    from app.config import settings
    from openai import OpenAI

    try:
        print(f"[cron] starting summarization for session {agent_session_id}", flush=True)

        supabase = get_supabase()

        items = get_conversation_items(supabase, agent_session_id=agent_session_id)
        print(f"[cron] fetched {len(items)} conversation items", flush=True)
        if not items:
            return {"status": "skipped", "reason": "no conversation items"}

        user_turns = [i for i in items if i.get("role") == "user"]
        print(f"[cron] found {len(user_turns)} user turns", flush=True)
        if len(user_turns) < 2:
            return {"status": "skipped", "reason": "fewer than 2 user turns"}

        lines = []
        for item in items:
            role = item.get("role")
            if role not in ("user", "assistant"):
                continue
            content_blocks = item.get("content", [])
            text = " ".join(
                block.get("text", "")
                for block in content_blocks
                if isinstance(block, dict) and block.get("text")
            ).strip()
            if text:
                lines.append(f"{role.capitalize()}: {text}")

        transcript = "\n".join(lines)
        print(f"[cron] built transcript ({len(lines)} lines), calling OpenAI", flush=True)

        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You summarize product manager conversations. "
                        "Write 2-3 sentences covering the main topics discussed, "
                        "decisions made, and any action items. Be specific and concise."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Summarize this conversation:\n\n{transcript}",
                },
            ],
            max_tokens=200,
            temperature=0.3,
        )

        summary = response.choices[0].message.content.strip()
        print(f"[cron] got summary: {summary}", flush=True)
        now = datetime.now(timezone.utc).isoformat()

        supabase.table("agent_sessions").update({
            "summary": summary,
            "last_summary_at": now,
        }).eq("id", agent_session_id).execute()

        print(f"[cron] summarized session {agent_session_id}", flush=True)
        return {"status": "success", "agent_session_id": agent_session_id}

    except Exception as e:
        print(f"[cron] ERROR summarizing session {agent_session_id}: {type(e).__name__}: {e}", flush=True)
        raise


# ---------------------------------------------------------------------------
# enqueue_stale_session_summaries  (the sweeper — this is what the cron calls)
# ---------------------------------------------------------------------------

def enqueue_stale_session_summaries(max_per_run: int = 20):
    """Find sessions that need summarizing and enqueue summarize_session for each.

    A session is eligible when:
    - Its last_message_at is at least 2 hours ago (session has cooled off), AND
    - It has never been summarized (last_summary_at IS NULL), OR
      it has new messages since the last summary (last_summary_at < last_message_at)

    max_per_run caps how many jobs are enqueued per cron tick to prevent
    burst load on a fresh deploy (when all existing sessions have null summaries).
    Remaining sessions are picked up on subsequent hourly runs.

    Safe to run repeatedly — already-summarized sessions with no new messages
    are skipped, so redundant cron fires are harmless.
    """
    supabase = get_supabase()
    q = get_queue()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    enqueued = 0

    # never summarized
    result1 = (
        supabase.table("agent_sessions")
        .select("id, user_id")
        .lt("last_message_at", cutoff)
        .is_("last_summary_at", "null")
        .neq("session_start_platform", "background")
        .limit(max_per_run)
        .execute()
    )
    for row in result1.data or []:
        if enqueued >= max_per_run:
            break
        q.enqueue(summarize_session, row["id"], row["user_id"])
        enqueued += 1

    # summarized, but new messages arrived since — filter column-to-column
    if enqueued < max_per_run:
        result2 = (
            supabase.table("agent_sessions")
            .select("id, user_id, last_message_at, last_summary_at")
            .lt("last_message_at", cutoff)
            .not_.is_("last_summary_at", "null")
            .neq("session_start_platform", "background")
            .limit(max_per_run - enqueued)
            .execute()
        )
        for row in result2.data or []:
            if enqueued >= max_per_run:
                break
            if row["last_summary_at"] < row["last_message_at"]:
                q.enqueue(summarize_session, row["id"], row["user_id"])
                enqueued += 1

    print(f"[cron] enqueued {enqueued} summarize_session jobs", flush=True)
    return {"status": "success", "enqueued": enqueued}


# ---------------------------------------------------------------------------
# enqueue_synthesis_for_active_users  (the sweeper — called by cron)
# ---------------------------------------------------------------------------

def enqueue_synthesis_for_active_users():
    """Find users with active passive monitoring and enqueue synthesis tasks.

    A user is eligible when they have at least one integration with
    monitoring_enabled = true for a supported provider (slack, github, linear).
    The per-user global flag (enable_agent_monitoring) is checked inside
    the synthesis task itself, keeping this sweeper lightweight.

    Safe to run repeatedly — synthesis tasks skip gracefully when there are
    no new events.
    """
    from app.workers.synthesis_tasks import synthesize_monitored_updates

    supabase = get_supabase()
    q = get_queue()

    result = (
        supabase.table("integrations")
        .select("user_id")
        .eq("monitoring_enabled", True)
        .in_("provider", ["slack", "github", "linear"])
        .execute()
    )

    user_ids = list({row["user_id"] for row in (result.data or [])})
    for user_id in user_ids:
        q.enqueue(synthesize_monitored_updates, user_id)

    print(f"[cron] enqueued {len(user_ids)} synthesize_monitored_updates jobs", flush=True)
    return {"status": "success", "enqueued": len(user_ids)}
