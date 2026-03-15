"""PostHog event name constants for the backend.

Always import from here instead of writing raw strings.
Typos become NameErrors, renames are a one-line change.
"""


class Events:
    # Slack agent interactions
    SLACK_AGENT_MENTIONED = "slack_agent_mentioned"
    SLACK_AGENT_DM = "slack_agent_dm"
    SLACK_AGENT_RUN_COMPLETED = "slack_agent_run_completed"
    SLACK_AGENT_RUN_FAILED = "slack_agent_run_failed"

    # Slack workspace lifecycle
    SLACK_CHANNEL_ADDED = "slack_channel_added"
    SLACK_APP_UNINSTALLED = "slack_app_uninstalled"
