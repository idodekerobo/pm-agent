"""Slack channel management routes."""

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase
from app.messaging.slack.installation_store import (
    get_channels,
    get_installation_by_user_id,
)
from app.schemas.slack import SlackChannel, SlackChannelUpdate

router = APIRouter()


# ---------------------------------------------------------------------------
# Web settings — channel management
# ---------------------------------------------------------------------------


@router.get("/integrations/slack/channels")
async def list_slack_channels(user_id: str = Depends(auth_protect_route)) -> list[SlackChannel]:
    """Return all channels the bot has been added to, with their is_enabled status."""
    installation = get_installation_by_user_id(user_id)
    if not installation:
        return []
    return get_channels(str(installation.id))


@router.patch("/integrations/slack/channels/{channel_id}")
async def toggle_slack_channel(
    channel_id: str,
    body: SlackChannelUpdate,
    user_id: str = Depends(auth_protect_route),
) -> SlackChannel:
    """Enable or disable the agent posting in a specific channel."""
    installation = get_installation_by_user_id(user_id)
    if not installation:
        raise HTTPException(status_code=404, detail="No Slack installation found")

    supabase = get_supabase()
    result = (
        supabase.table("slack_channels")
        .update({"is_enabled": body.is_enabled})
        .eq("installation_id", str(installation.id))
        .eq("slack_channel_id", channel_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Channel not found")
    return SlackChannel.model_validate(result.data[0])
