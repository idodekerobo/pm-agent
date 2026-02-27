"""Conversation item schema for conversation management."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


class ConversationItemBase(BaseModel):
    """Base conversation item schema with essential fields."""

    agent_session_id: UUID
    item: dict
    parent_id: Optional[UUID] = None
    source_platform: str = "web"
    source_channel_id: Optional[str] = None


class ConversationItemCreate(ConversationItemBase):
    """Conversation item creation schema for POST requests."""

    pass


class ConversationItem(ConversationItemBase):
    """Full conversation item schema for read responses."""

    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
