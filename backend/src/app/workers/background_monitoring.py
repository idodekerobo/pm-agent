"""Background tasks for background context ingestion.

GitHub: process_github_background_event — sync RQ task, dispatched from
  the GitHub webhook handler after ACKing.

Slack: process_slack_background_event — async, called inline from
  events_handler.dispatch_event (already running inside asyncio.run in the
  RQ worker, so no second RQ hop needed).
"""

import asyncio
from datetime import datetime, timezone

from app.db.supabase_client import get_supabase


# ---------------------------------------------------------------------------
# Monitoring flag helpers
# ---------------------------------------------------------------------------

def _is_monitoring_enabled(supabase, user_id: str, provider: str) -> bool:
    """Check all three monitoring flag levels for a given user+provider.

    Returns False if any level has monitoring disabled:
      1. users.enable_agent_monitoring  — global kill switch
      2. integrations.monitoring_enabled — per-provider toggle
    """
    user_row = (
        supabase.table("users")
        .select("enable_agent_monitoring")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if not user_row or not user_row.data:
        return False
    if not user_row.data.get("enable_agent_monitoring", True):
        return False

    integration_row = (
        supabase.table("integrations")
        .select("monitoring_enabled")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .maybe_single()
        .execute()
    )
    if not integration_row or not integration_row.data:
        return False
    if not integration_row.data.get("monitoring_enabled", True):
        return False

    return True


def _is_repo_monitoring_enabled(supabase, user_id: str, repo_full_name: str) -> bool:
    """Check github_installations.repo_monitoring_config for this specific repo.

    Defaults to True if the repo isn't in the config yet (e.g. just added to
    the installation before the next sync).
    """
    row = (
        supabase.table("github_installations")
        .select("repo_monitoring_config")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        return True  # no config yet — default on
    config: dict = row.data.get("repo_monitoring_config") or {}
    return config.get(repo_full_name, True)


# ---------------------------------------------------------------------------
# GitHub event builder helpers
# ---------------------------------------------------------------------------

def _build_pr_event(delivery_id: str, payload: dict, now_iso: str, repo_full_name: str) -> dict | None:
    """Build a GitHubEvent dict from a pull_request webhook payload.

    Returns None for actions we don't track (labeled, synchronize, etc.).
    """
    from app.events import GitHubEvent

    action = payload.get("action")
    pr = payload.get("pull_request", {})

    if action == "opened":
        event_type = "pull_request.opened"
    elif action == "closed":
        # GitHub sends action=closed for both merge and close-without-merge
        event_type = "pull_request.merged" if pr.get("merged") else "pull_request.closed"
    elif action == "review_requested":
        event_type = "pull_request.review_requested"
    elif action == "ready_for_review":
        event_type = "pull_request.ready_for_review"
    else:
        return None  # skip synchronize, labeled, unlabeled, etc.

    body = pr.get("body") or ""
    return GitHubEvent(
        ts=now_iso,
        type=event_type,
        resource=repo_full_name,
        author=pr.get("user", {}).get("login", "unknown"),
        github_delivery_id=delivery_id,
        pr_number=pr["number"],
        pr_id=pr["id"],
        pr_title=pr.get("title", ""),
        pr_body_excerpt=body[:500] if body else None,
        base_branch=pr.get("base", {}).get("ref", ""),
        head_branch=pr.get("head", {}).get("ref", ""),
        labels=[label.get("name", "") for label in pr.get("labels", [])],
        raw_ref=pr.get("html_url", ""),
    ).model_dump()


def _build_pr_review_event(delivery_id: str, payload: dict, now_iso: str, repo_full_name: str) -> dict | None:
    """Build a GitHubEvent dict from a pull_request_review webhook payload.

    Only handles action=submitted. Returns None for dismissed, edited, etc.
    """
    from app.events import GitHubEvent

    action = payload.get("action")
    if action != "submitted":
        return None

    review = payload.get("review", {})
    pr = payload.get("pull_request", {})
    state = review.get("state", "").lower()  # "approved", "changes_requested", "commented"

    return GitHubEvent(
        ts=now_iso,
        type=f"pull_request_review.{state}",
        resource=repo_full_name,
        author=review.get("user", {}).get("login", "unknown"),
        github_delivery_id=delivery_id,
        pr_number=pr["number"],
        pr_id=pr["id"],
        pr_title=pr.get("title", ""),
        pr_body_excerpt=None,
        base_branch=pr.get("base", {}).get("ref", ""),
        head_branch=pr.get("head", {}).get("ref", ""),
        labels=[],
        raw_ref=pr.get("html_url", ""),
    ).model_dump()


# ---------------------------------------------------------------------------
# RQ task
# ---------------------------------------------------------------------------

def process_github_background_event(
    event_type: str,
    delivery_id: str,
    payload: dict,
    user_id: str,
) -> None:
    """RQ task: check monitoring flags, build event, write to event log.

    Called from the GitHub webhook handler for pull_request and
    pull_request_review events. Silently no-ops if monitoring is disabled
    at any level or if the event action isn't one we track.
    """
    from app.events import append_event_log

    supabase = get_supabase()

    # Monitoring gate — check all levels before doing any work
    if not _is_monitoring_enabled(supabase, user_id, "github"):
        return

    repo_full_name: str = payload.get("repository", {}).get("full_name", "")
    if not repo_full_name:
        print(f"[github background] missing repository.full_name in payload — skipping", flush=True)
        return

    if not _is_repo_monitoring_enabled(supabase, user_id, repo_full_name):
        return

    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if event_type == "pull_request":
        event_dict = _build_pr_event(delivery_id, payload, now_iso, repo_full_name)
    elif event_type == "pull_request_review":
        event_dict = _build_pr_review_event(delivery_id, payload, now_iso, repo_full_name)
    else:
        return  # shouldn't reach here — webhook handler only enqueues known types

    if not event_dict:
        return  # untracked action (e.g. PR labeled, review dismissed)

    asyncio.run(append_event_log(user_id, "github", repo_full_name, event_dict))
    print(f"[github background] logged {event_dict['type']} for {repo_full_name} user={user_id}", flush=True)


# ---------------------------------------------------------------------------
# Slack background ingestion
# ---------------------------------------------------------------------------

async def process_slack_background_event(event: dict, installation) -> None:
    """Async — called inline from events_handler.dispatch_event.

    Already runs inside asyncio.run() in the RQ worker, so append_event_log
    is awaited directly (no second RQ hop needed).

    Logs all channel messages:
      - Human messages → type "message", actor resolved via get_user_info
      - Our bot's messages → type "bot_reply", actor = slack_bot_user_id
      - Third-party bot/integration messages → type "bot_message", actor = bot_id

    Filters:
      - Skip message subtypes (edited, deleted, channel_join, etc.)
      - Skip messages with no text and no files
    """
    from app.events import append_event_log, SlackEvent
    from app.db.supabase_client import get_supabase

    # ── Message filters ──────────────────────────────────────────────────────

    is_bot_message = bool(event.get("bot_id"))
    is_our_bot = is_bot_message and event.get("app_id") == installation.slack_app_id

    # Subtypes: message_changed, message_deleted, channel_join, etc.
    # TODO: investigate whether the app should reactively update the jsonl when messages are edited
    if event.get("subtype"):
        return

    text = event.get("text", "").strip()
    files = event.get("files", [])
    if not text and not files:
        return

    # ── Monitoring flag checks ───────────────────────────────────────────────

    supabase = get_supabase()
    user_id = str(installation.user_id)
    channel_id: str = event.get("channel", "")

    if not _is_monitoring_enabled(supabase, user_id, "slack"):
        return

    # Channel-level check: look up monitoring_enabled + channel_name in one query.
    # slack_channels is keyed by (installation_id, slack_channel_id).
    channel_row = (
        supabase.table("slack_channels")
        .select("slack_channel_name, monitoring_enabled")
        .eq("installation_id", str(installation.id))
        .eq("slack_channel_id", channel_id)
        .maybe_single()
        .execute()
    )

    if not channel_row or not channel_row.data:
        # Channel not in our DB — bot was added but member_joined_channel hasn't
        # fired yet, or the channel was added via another path. Skip safely.
        return

    if not channel_row.data.get("monitoring_enabled", True):
        return

    channel_name: str = channel_row.data.get("slack_channel_name") or channel_id

    # ── Build event ──────────────────────────────────────────────────────────

    slack_ts: str = event.get("ts", "")
    thread_ts: str | None = event.get("thread_ts")
    is_thread_reply = bool(thread_ts and thread_ts != slack_ts)

    # Convert Slack ts (Unix float string) to ISO 8601 UTC
    try:
        ts_iso = datetime.fromtimestamp(float(slack_ts), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (ValueError, TypeError):
        ts_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    # Slack permalink format: p{ts_no_dot}
    ts_for_url = slack_ts.replace(".", "")
    raw_ref = f"https://app.slack.com/archives/{channel_id}/p{ts_for_url}"

    # Capture file metadata without downloading — synthesis job can fetch if needed
    file_entries = [
        {
            "id": f.get("id", ""),
            "name": f.get("name", ""),
            "mimetype": f.get("mimetype", ""),
            "url_private": f.get("url_private", ""),
        }
        for f in files
    ]

    # Resolve actor and event type based on message origin
    # Bot messages carry `username` (display name) directly in the event — no API call needed.
    # Human messages require a get_user_info call to resolve display/real name.
    actor_display_name: str | None = None
    actor_real_name: str | None = None

    if is_our_bot:
        event_type = "bot_reply"
        actor_id = installation.slack_bot_user_id
        actor_display_name = installation.slack_bot_name or event.get("username") or None
    elif is_bot_message:
        event_type = "bot_message"
        actor_id = event.get("bot_id", "unknown")
        actor_display_name = event.get("username") or None  # best-effort; not always present
    else:
        event_type = "message"
        actor_id = event.get("user", "unknown")
        try:
            from app.messaging.slack.client import get_user_info
            user_info = await get_user_info(installation.bot_token, actor_id)
            profile = user_info.get("profile", {})
            actor_display_name = profile.get("display_name") or None
            actor_real_name = profile.get("real_name") or None
        except Exception:
            pass

    resource = f"{channel_id}-{channel_name}"

    event_dict = SlackEvent(
        ts=ts_iso,
        type=event_type,
        resource=resource,
        channel_id=channel_id,
        channel_name=channel_name,
        actor_id=actor_id,
        actor_display_name=actor_display_name,
        actor_real_name=actor_real_name,
        slack_ts=slack_ts,
        text=text,
        thread_ts=thread_ts if is_thread_reply else None,
        is_thread_reply=is_thread_reply,
        files=file_entries,
        raw_ref=raw_ref,
    ).model_dump()

    await append_event_log(user_id, "slack", resource, event_dict)
    print(f"[slack background] logged message in #{channel_name} user={user_id} thread_reply={is_thread_reply}", flush=True)


# ---------------------------------------------------------------------------
# Linear background ingestion
# ---------------------------------------------------------------------------

_PRIORITY_MAP = {0: "no_priority", 1: "urgent", 2: "high", 3: "medium", 4: "low"}


def _resolve_issue_event_type(action: str, updated_from: dict) -> str:
    """Map a Linear Issue action + updatedFrom dict to a specific event type string.

    For updates, inspect which fields changed (priority order: status > assignee > generic).
    """
    if action == "create":
        return "issue.created"
    if action == "update":
        if "stateId" in updated_from:
            return "issue.status_changed"
        if "assigneeId" in updated_from:
            return "issue.assigned"
        return "issue.updated"
    return f"issue.{action}"


def _get_team_for_event(supabase, installation_id: str, team_id: str) -> dict | None:
    """Look up linear_teams row by installation_id + linear_team_id.

    Returns the full row (team_key, monitoring_enabled) or None.
    """
    result = (
        supabase.table("linear_teams")
        .select("team_key, monitoring_enabled")
        .eq("installation_id", installation_id)
        .eq("linear_team_id", team_id)
        .maybe_single()
        .execute()
    )
    return result.data if result and result.data else None


def process_linear_background_event(
    event_type: str,
    action: str,
    payload: dict,
    user_id: str,
    installation_id: str,
) -> None:
    """RQ task: check monitoring flags, build event, write to event log.

    Called from the Linear webhook handler for Issue and Comment events.
    Silently no-ops if monitoring is disabled at any level or if the team
    isn't tracked.
    """
    from app.events import append_event_log, LinearEvent

    supabase = get_supabase()

    # Monitoring gate — global + provider level
    if not _is_monitoring_enabled(supabase, user_id, "linear"):
        return

    data: dict = payload.get("data", {})
    updated_from: dict = payload.get("updatedFrom", {})

    # Resolve team — present directly on Issue events; for Comments it's nested
    # under data.issue.team (if available) or data.team.
    team_data = data.get("team") or data.get("issue", {}).get("team") or {}
    team_id: str = team_data.get("id", "")

    if not team_id:
        print(f"[linear background] could not resolve team_id from payload — skipping", flush=True)
        return

    team_row = _get_team_for_event(supabase, installation_id, team_id)
    if not team_row:
        # Team not in our DB yet (e.g. added after last sync) — skip
        return
    if not team_row.get("monitoring_enabled", True):
        return

    team_key: str = team_row.get("team_key") or team_id
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if event_type == "Issue":
        event_dict = _build_linear_issue_event(action, data, updated_from, team_key, now_iso)
    elif event_type == "Comment":
        event_dict = _build_linear_comment_event(data, team_key, now_iso)
    else:
        return

    if not event_dict:
        return

    asyncio.run(append_event_log(user_id, "linear", team_key, event_dict))
    print(f"[linear background] logged {event_dict['type']} for team={team_key} user={user_id}", flush=True)


def _build_linear_issue_event(
    action: str,
    data: dict,
    updated_from: dict,
    team_key: str,
    now_iso: str,
) -> dict | None:
    from app.events import LinearEvent

    issue_id: str = data.get("identifier", "")  # e.g. "ENG-142"
    issue_uuid: str = data.get("id", "")
    if not issue_id or not issue_uuid:
        return None

    event_type_str = _resolve_issue_event_type(action, updated_from)
    actor = (data.get("creator") or {}).get("name") or "unknown"
    priority_num = data.get("priority", 0)

    change: dict | None = None
    if event_type_str == "issue.status_changed":
        change = {"status": {"from": None, "to": (data.get("state") or {}).get("name")}}
    elif event_type_str == "issue.assigned":
        change = {"assignee": {"from": None, "to": (data.get("assignee") or {}).get("name")}}

    cycle_id: str | None = (data.get("cycle") or {}).get("id")
    raw_ref = f"https://linear.app/issue/{issue_id}"

    return LinearEvent(
        ts=now_iso,
        type=event_type_str,
        resource=team_key,
        actor=actor,
        issue_id=issue_id,
        issue_uuid=issue_uuid,
        issue_title=data.get("title", ""),
        priority=_PRIORITY_MAP.get(priority_num),
        change=change,
        cycle_id=cycle_id,
        raw_ref=raw_ref,
    ).model_dump()


def _build_linear_comment_event(data: dict, team_key: str, now_iso: str) -> dict | None:
    from app.events import LinearEvent

    issue_data = data.get("issue") or {}
    issue_id: str = issue_data.get("identifier", "")
    issue_uuid: str = issue_data.get("id", "")
    if not issue_id or not issue_uuid:
        return None

    actor = (data.get("user") or {}).get("name") or "unknown"
    comment_body: str = data.get("body", "")
    raw_ref = f"https://linear.app/issue/{issue_id}#comment-{data.get('id', '')}"

    return LinearEvent(
        ts=now_iso,
        type="comment.created",
        resource=team_key,
        actor=actor,
        issue_id=issue_id,
        issue_uuid=issue_uuid,
        issue_title=issue_data.get("title", ""),
        comment_id=data.get("id"),
        comment_body=comment_body,
        raw_ref=raw_ref,
    ).model_dump()
