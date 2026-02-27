from dataclasses import dataclass


@dataclass
class AgentContext:
    organization_id: str
    user_id: str
    workspace_id: str
    sandbox_id: str | None = None
