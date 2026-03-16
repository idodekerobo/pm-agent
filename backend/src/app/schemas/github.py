"""GitHub schemas for github_installations table."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


class GitHubInstallationBase(BaseModel):
    """Fields shared across all GitHubInstallation schema variants."""

    installation_id: int
    account_login: Optional[str] = None
    account_type: Optional[str] = None          # 'User' or 'Organization'
    bot_token: str                               # encrypted ghs_ token
    bot_token_expires_at: datetime
    user_token: Optional[str] = None            # encrypted ghu_ token, nullable
    user_token_expires_at: Optional[datetime] = None
    user_refresh_token: Optional[str] = None
    # JSONB map of {"owner/repo": bool} — true means background monitoring is enabled.
    # Seeded at install time via GET /installation/repositories; kept fresh via
    # installation_repositories webhook events.
    repo_monitoring_config: dict = {}


class GitHubInstallationCreate(GitHubInstallationBase):
    """Schema for creating a new installation record (App install callback)."""

    user_id: UUID


class GitHubInstallation(GitHubInstallationBase):
    """Full installation schema for read responses."""

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GitHubRepoMonitoringUpdate(BaseModel):
    """Schema for toggling background monitoring on a specific repo."""

    full_name: str   # GitHub repo full_name, e.g. "acmecorp/backend"
    monitoring_enabled: bool
