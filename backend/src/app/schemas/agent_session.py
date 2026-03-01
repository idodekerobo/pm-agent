"""Agent session schema for agent session management."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


class AgentSessionBase(BaseModel):
    """Base agent session schema with essential fields."""

    user_id: UUID
    organization_id: Optional[str] = None
    project_id: UUID
    workspace_id: UUID
    session_start_platform: str = "web"
    external_thread_id: Optional[str] = None
    display_name: Optional[str] = None


class AgentSessionCreate(AgentSessionBase):
    """Agent session creation schema for POST requests."""

    pass


class AgentSession(AgentSessionBase):
    """Full agent session schema for read responses."""

    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
