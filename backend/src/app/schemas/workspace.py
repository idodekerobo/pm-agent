"""Workspace schema for workspace management."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


class WorkspaceBase(BaseModel):
    """Base workspace schema with essential fields."""

    user_id: UUID
    organization_id: Optional[str] = None
    modal_volume_name: Optional[str] = None
    last_sandbox_id: Optional[str] = None
    sandbox_status: Optional[str] = None


class WorkspaceCreate(WorkspaceBase):
    """Workspace creation schema for POST requests."""

    pass


class Workspace(WorkspaceBase):
    """Full workspace schema for read responses."""

    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
