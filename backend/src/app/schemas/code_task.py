"""Code task schema for coding agent task management."""

from enum import Enum
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


class CodeTaskStatus(str, Enum):
    queued = "queued"
    cloning = "cloning"
    running = "running"
    pushing = "pushing"
    complete = "complete"
    failed = "failed"


class CodeTaskBase(BaseModel):
    """Base code task schema with essential fields."""

    agent_session_id: UUID
    user_id: UUID
    workspace_id: UUID
    status: CodeTaskStatus = CodeTaskStatus.queued
    repo_url: str
    base_branch: str = "main"
    output_branch: Optional[str] = None
    pr_url: Optional[str] = None
    spec: str
    error_message: Optional[str] = None


class CodeTaskCreate(CodeTaskBase):
    """Code task creation schema for inserts."""

    pass


class CodeTask(CodeTaskBase):
    """Full code task schema for read responses."""

    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
