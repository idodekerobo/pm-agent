"""Project schema for project management."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


class ProjectBase(BaseModel):
    """Base project schema with essential fields."""

    user_id: UUID
    name: Optional[str] = None
    organization_id: Optional[str] = None
    workspace_id: UUID


class ProjectCreate(ProjectBase):
    """Project creation schema for POST requests."""

    pass


class Project(ProjectBase):
    """Full project schema for read responses."""

    id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
