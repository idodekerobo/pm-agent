"""Linear schemas for linear_installations and linear_teams tables."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


# ---------------------------------------------------------------------------
# LinearInstallation
# ---------------------------------------------------------------------------


class LinearInstallationBase(BaseModel):
    """Fields shared across all LinearInstallation schema variants."""

    linear_workspace_id: str
    linear_workspace_name: Optional[str] = None


class LinearInstallationCreate(LinearInstallationBase):
    """Schema for creating a new installation record (OAuth callback)."""

    user_id: UUID


class LinearInstallation(LinearInstallationBase):
    """Full installation schema for read responses."""

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# LinearTeam
# ---------------------------------------------------------------------------


class LinearTeamBase(BaseModel):
    """Fields shared across all LinearTeam schema variants."""

    linear_team_id: str
    team_name: Optional[str] = None
    team_key: Optional[str] = None   # Linear's short identifier, e.g. "ENG"
    monitoring_enabled: bool = True


class LinearTeamCreate(LinearTeamBase):
    """Schema for seeding a team row (OAuth callback or manual sync)."""

    installation_id: UUID


class LinearTeamMonitoringUpdate(BaseModel):
    """Schema for toggling background monitoring on a specific team."""

    monitoring_enabled: bool


class LinearTeam(LinearTeamBase):
    """Full team schema for read responses."""

    id: UUID
    installation_id: UUID
    synced_at: datetime

    model_config = ConfigDict(from_attributes=True)
