"""Slack schemas for slack_installations and slack_channels tables."""

from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime
from typing import Optional


# ---------------------------------------------------------------------------
# SlackInstallation
# ---------------------------------------------------------------------------


class SlackInstallationBase(BaseModel):
    """Fields shared across all SlackInstallation schema variants."""

    organization_id: Optional[str] = None
    slack_team_id: str
    slack_team_name: Optional[str] = None
    slack_bot_user_id: str
    slack_app_id: str
    bot_token: str
    installer_slack_user_id: Optional[str] = None


class SlackInstallationCreate(SlackInstallationBase):
    """Schema for creating a new installation record (OAuth callback)."""

    user_id: UUID


class SlackInstallation(SlackInstallationBase):
    """Full installation schema for read responses."""

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# SlackChannel
# ---------------------------------------------------------------------------


class SlackChannelBase(BaseModel):
    """Fields shared across all SlackChannel schema variants."""

    slack_channel_id: str
    slack_channel_name: Optional[str] = None
    is_enabled: bool = True          # controls whether the bot responds in this channel
    monitoring_enabled: bool = True  # controls whether the agent passively monitors this channel


class SlackChannelCreate(SlackChannelBase):
    """Schema for registering a channel (member_joined_channel event)."""

    installation_id: UUID


class SlackChannelUpdate(BaseModel):
    """Schema for toggling is_enabled from the web settings UI."""

    is_enabled: bool


class SlackChannelMonitoringUpdate(BaseModel):
    """Schema for toggling monitoring_enabled from the web settings UI."""

    monitoring_enabled: bool


class SlackChannel(SlackChannelBase):
    """Full channel schema for read responses."""

    id: UUID
    installation_id: UUID
    added_at: datetime

    model_config = ConfigDict(from_attributes=True)
