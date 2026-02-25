"""Integration schema for integration management."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


class IntegrationBase(BaseModel):
    """Base integration schema with essential fields."""

    provider: str
    account_label: Optional[str] = None
    organization_id: Optional[str] = None
    scopes: list[str]
    access_token: str
    refresh_token: Optional[str] = None
    expires_at: datetime


class IntegrationCreate(IntegrationBase):
    """Integration creation schema for POST requests."""

    pass


class Integration(IntegrationBase):
    """Full integration schema for read responses."""

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
