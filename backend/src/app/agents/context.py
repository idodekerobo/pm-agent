from dataclasses import dataclass


@dataclass
class AgentContext:
    organization_id: str
    user_id: str
    workspace_id: str
    sandbox_id: str | None = None
    # Populated when the agent is running in response to a Slack @-mention.
    # Contains: channel_id, ts, thread_ts (None if top-level), is_in_thread (bool)
    slack_mention_context: dict | None = None
    # Flipped to True by dispatcher.py when the agent calls tool_slack action_type="reply"
    slack_mention_replied: bool = False

"""
- TODO: build callable build context function that helps put together context for the agent in diff places its called in the codebase
- TODO: build callable build msg history function that can be called to inject into message history where needed
"""