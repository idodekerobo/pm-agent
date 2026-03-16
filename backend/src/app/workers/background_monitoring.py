"""Background tasks for passive context ingestion.

All webhook handlers (GitHub, Slack, Linear) dispatch here via RQ after
ACKing the webhook. These tasks check monitoring flags, build structured
event dicts, and call append_event_log to write to the user's Modal Volume.

RQ tasks must be synchronous. asyncio.run() is used to call async utilities.
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
        actor=pr.get("user", {}).get("login", "unknown"),
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
        actor=review.get("user", {}).get("login", "unknown"),
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
        print(f"[github passive] missing repository.full_name in payload — skipping", flush=True)
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
    print(f"[github passive] logged {event_dict['type']} for {repo_full_name} user={user_id}", flush=True)
