"""Cross-provider monitoring state endpoint.

GET  /integrations/monitoring        — read full monitoring config across all connected providers
PATCH /integrations/monitoring/settings — toggle the global enable_agent_monitoring flag on users
"""
from pydantic import BaseModel
from fastapi import APIRouter, Depends

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase
from app.integrations.monitoring import MONITORING_PROVIDERS

router = APIRouter(prefix="/monitoring")


class GlobalMonitoringUpdate(BaseModel):
    enable_agent_monitoring: bool


@router.get("")
async def get_monitoring_state(user_id: str = Depends(auth_protect_route)):
    """Return full monitoring config for all connected providers that support monitoring."""
    supabase = get_supabase()

    user_row = (
        supabase.table("users")
        .select("enable_agent_monitoring")
        .eq("id", user_id)
        .single()
        .execute()
    )
    global_enabled = (user_row.data or {}).get("enable_agent_monitoring", True)

    integrations = (
        supabase.table("integrations")
        .select("provider, monitoring_enabled")
        .eq("user_id", user_id)
        .in_("provider", list(MONITORING_PROVIDERS))
        .execute()
    ).data or []

    providers: dict = {}

    for row in integrations:
        provider = row["provider"]
        provider_monitoring_enabled = row.get("monitoring_enabled", True)

        if provider == "slack":
            installation = (
                supabase.table("slack_installations")
                .select("id")
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
            channels = []
            if installation and installation.data:
                channel_rows = (
                    supabase.table("slack_channels")
                    .select("slack_channel_id, slack_channel_name, monitoring_enabled")
                    .eq("installation_id", installation.data["id"])
                    .execute()
                ).data or []
                channels = [
                    {
                        "id": c["slack_channel_id"],
                        "name": c.get("slack_channel_name") or c["slack_channel_id"],
                        "monitoring_enabled": c.get("monitoring_enabled", True),
                    }
                    for c in channel_rows
                ]
            providers["slack"] = {
                "monitoring_enabled": provider_monitoring_enabled,
                "channels": channels,
            }

        elif provider == "github":
            installation = (
                supabase.table("github_installations")
                .select("repo_monitoring_config")
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
            repos = []
            if installation and installation.data:
                config = installation.data.get("repo_monitoring_config") or {}
                repos = [
                    {"full_name": full_name, "monitoring_enabled": enabled}
                    for full_name, enabled in config.items()
                ]
            providers["github"] = {
                "monitoring_enabled": provider_monitoring_enabled,
                "repos": repos,
            }

        elif provider == "linear":
            installation = (
                supabase.table("linear_installations")
                .select("id")
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
            teams = []
            if installation and installation.data:
                team_rows = (
                    supabase.table("linear_teams")
                    .select("linear_team_id, team_name, team_key, monitoring_enabled")
                    .eq("installation_id", installation.data["id"])
                    .execute()
                ).data or []
                teams = [
                    {
                        "id": t["linear_team_id"],
                        "name": t.get("team_name") or t["linear_team_id"],
                        "key": t.get("team_key") or "",
                        "monitoring_enabled": t.get("monitoring_enabled", True),
                    }
                    for t in team_rows
                ]
            providers["linear"] = {
                "monitoring_enabled": provider_monitoring_enabled,
                "teams": teams,
            }

    return {"global_enabled": global_enabled, "providers": providers}


@router.patch("/settings")
async def update_global_monitoring(
    req: GlobalMonitoringUpdate,
    user_id: str = Depends(auth_protect_route),
):
    """Toggle the global monitoring kill switch on the user row."""
    supabase = get_supabase()
    supabase.table("users").update(
        {"enable_agent_monitoring": req.enable_agent_monitoring}
    ).eq("id", user_id).execute()
    return {"enable_agent_monitoring": req.enable_agent_monitoring}
