from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class BaseEvent(BaseModel):
    ts: str        # ISO 8601 UTC, e.g. "2026-03-15T14:32:00Z"
    provider: str
    type: str      # e.g. "message", "pull_request.opened", "issue.status_changed"
    resource: str  # original provider-scoped identifier — NOT path-sanitized


class SlackEvent(BaseEvent):
    provider: Literal["slack"] = "slack"
    channel_id: str
    channel_name: str
    actor_id: str
    slack_ts: str            # Slack's native message ID, e.g. "1741234500.000100"
                             # Unique key: (channel_id, slack_ts)
                             # Fetch via: conversations.history(channel=channel_id, latest=slack_ts, limit=1, inclusive=true)
                             # Thread fetch: conversations.replies(channel=channel_id, ts=thread_ts)
    text: str
    thread_ts: Optional[str] = None   # null = top-level message; set = reply to this parent
    is_thread_reply: bool = False
    files: list[dict] = []            # [{id, name, mimetype, url_private}]
    raw_ref: str                      # https://app.slack.com/archives/{channel_id}/p{slack_ts_no_dot}


class GitHubEvent(BaseEvent):
    provider: Literal["github"] = "github"
    author: str              # GitHub login of the PR author (pull_request.user.login)
                             # For reviews: the reviewer's login (review.user.login)
    github_delivery_id: str  # from X-GitHub-Delivery header — dedup key
    pr_number: int
    pr_id: int               # GitHub internal ID
    pr_title: str
    pr_body_excerpt: Optional[str] = None
    base_branch: str
    head_branch: str
    labels: list[str] = []
    raw_ref: str             # https://github.com/{resource}/pull/{pr_number}
                             # Fetch details: gh pr view {pr_number} --repo {resource} --json title,body,commits,files,reviews


class LinearEvent(BaseEvent):
    provider: Literal["linear"] = "linear"
    actor: str               # Linear's internal value for the user who triggered the event
    issue_id: str            # human-readable identifier, e.g. "ENG-142"
    issue_uuid: str          # Linear's internal UUID
    issue_title: str
    priority: Optional[str] = None
    change: Optional[dict] = None       # {"status": {"from": "...", "to": "..."}} for status_changed events
    cycle_id: Optional[str] = None      # present when issue belongs to a cycle
    comment_id: Optional[str] = None    # present on comment.created events
    comment_body: Optional[str] = None
    raw_ref: str                        # https://linear.app/{org}/issue/{issue_id}
                                        # Fetch details: linear issue view {issue_id}
