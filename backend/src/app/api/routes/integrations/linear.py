from datetime import datetime, timezone

import httpx
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.api.deps import auth_protect_route
from app.config import settings
from app.db.supabase_client import get_supabase
from app.integrations.crypto import decrypt_token, encrypt_token
from app.workers.queue import queue
from app.workers.tasks import deprovision_skill, gather_linear_context, provision_skill

router = APIRouter(prefix="/linear")

_LINEAR_TEAMS_QUERY = """
query {
  organization {
    id
    name
  }
  teams {
    nodes {
      id
      name
      key
    }
  }
}
"""


async def _fetch_linear_workspace_and_teams(access_token: str) -> tuple[dict, list[dict]]:
    """Call Linear GraphQL API to get organization info and all teams.

    Returns (organization_dict, list_of_team_dicts).
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.linear.app/graphql",
            json={"query": _LINEAR_TEAMS_QUERY},
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
    data = resp.json().get("data", {})
    org = data.get("organization", {})
    teams = data.get("teams", {}).get("nodes", [])
    return org, teams


async def _seed_linear_teams(user_id: str, access_token: str) -> None:
    """Create linear_installations row and seed linear_teams.

    Called as a background task after Linear OAuth callback.
    All teams default to monitoring_enabled=true.
    """
    try:
        org, teams = await _fetch_linear_workspace_and_teams(access_token)
        if not org.get("id"):
            return

        supabase = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()

        # Upsert the workspace-level installation row
        result = (
            supabase.table("linear_installations")
            .upsert(
                {
                    "user_id": user_id,
                    "linear_workspace_id": org["id"],
                    "linear_workspace_name": org.get("name"),
                    "updated_at": now_iso,
                },
                on_conflict="user_id,linear_workspace_id",
            )
            .execute()
        )
        installation_id = (result.data or [{}])[0].get("id")
        if not installation_id:
            # Fetch the id since upsert may not return it on conflict
            row = (
                supabase.table("linear_installations")
                .select("id")
                .eq("user_id", user_id)
                .eq("linear_workspace_id", org["id"])
                .single()
                .execute()
            )
            installation_id = row.data["id"]

        # Upsert each team; preserve existing monitoring_enabled if already present
        existing = (
            supabase.table("linear_teams")
            .select("linear_team_id, monitoring_enabled")
            .eq("installation_id", installation_id)
            .execute()
        ).data or []
        existing_map = {t["linear_team_id"]: t["monitoring_enabled"] for t in existing}

        for team in teams:
            supabase.table("linear_teams").upsert(
                {
                    "installation_id": installation_id,
                    "linear_team_id": team["id"],
                    "team_name": team.get("name"),
                    "team_key": team.get("key"),
                    "monitoring_enabled": existing_map.get(team["id"], True),
                    "synced_at": now_iso,
                },
                on_conflict="installation_id,linear_team_id",
            ).execute()
    except Exception as e:
        print(f"[linear] team seed failed: {e}")


oauth = OAuth()
oauth.register(
    name="linear",
    client_id=settings.linear_client_id,
    client_secret=settings.linear_client_secret,
    authorize_url="https://linear.app/oauth/authorize",
    access_token_url="https://api.linear.app/oauth/token",
    client_kwargs={"scope": "read,write"},
)


@router.get("/connect")
async def linear_connect(request: Request, user_id: str):
    request.session["connecting_user_id"] = user_id
    redirect_uri = f"{settings.api_base_url}/integrations/linear/callback"
    return await oauth.linear.authorize_redirect(request, redirect_uri, actor="app")


# TODO: wrap in try/except
@router.get("/callback", name="linear_callback")
async def linear_callback(request: Request, background_tasks: BackgroundTasks):
    user_id = request.session.pop("connecting_user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=400,
            detail="Session expired or user not found. Please try connecting again.",
        )

    token = await oauth.linear.authorize_access_token(request)
    supabase = get_supabase()

    # TODO: fetch user info from linear or this app to make a structured name for the account label
    account_label = token.get("userinfo", {}).get("email", "Linear Account")

    expires_at = None
    if "expires_in" in token:
        expires_timestamp = datetime.now(timezone.utc).timestamp() + token["expires_in"]
        expires_at = datetime.fromtimestamp(expires_timestamp, tz=timezone.utc).isoformat()

    supabase.table("integrations").upsert({
        "user_id": user_id,
        "provider": "linear",
        "account_label": account_label,
        "access_token": encrypt_token(token["access_token"]),
        "refresh_token": encrypt_token(token.get("refresh_token", "")),
        "expires_at": expires_at,
        "scopes": token.get("scope", "").split() if isinstance(token.get("scope"), str) else [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # runs syncrhonously as long as there is one worker, gather_*_context task depends on the skill
    queue.enqueue(provision_skill, user_id, "linear")
    queue.enqueue(gather_linear_context, user_id)

    # Seed linear_installations + linear_teams in the background
    plain_token = token["access_token"]
    background_tasks.add_task(_seed_linear_teams, user_id, plain_token)

    return RedirectResponse(f"{settings.client_app_base_url}/integrations/linear/success")


@router.post("/sync-agent")
async def sync_linear(user_id: str = Depends(auth_protect_route)):
    """Queue up a task to gather context from Linear."""
    try:
        job = queue.enqueue(gather_linear_context, user_id)
        print(f"Linear job enqueued successfully: {job.id if job else 'NO JOB RETURNED'}")
        return {"status": "success", "message": "Linear context gathering queued", "job_id": job.id if job else None}
    except Exception as e:
        print(f"ERROR enqueueing Linear job: {e}")
        raise HTTPException(status_code=503, detail=f"Failed to enqueue: {e}")


# ---------------------------------------------------------------------------
# Monitoring endpoints
# ---------------------------------------------------------------------------

class ProviderMonitoringUpdate(BaseModel):
    monitoring_enabled: bool


class TeamMonitoringUpdate(BaseModel):
    monitoring_enabled: bool


@router.patch("/monitoring")
async def update_linear_monitoring(
    req: ProviderMonitoringUpdate,
    user_id: str = Depends(auth_protect_route),
):
    """Toggle provider-level monitoring for Linear."""
    supabase = get_supabase()
    supabase.table("integrations").update(
        {"monitoring_enabled": req.monitoring_enabled}
    ).eq("user_id", user_id).eq("provider", "linear").execute()
    return {"monitoring_enabled": req.monitoring_enabled}


@router.patch("/teams/{team_id}/monitoring")
async def update_team_monitoring(
    team_id: str,
    req: TeamMonitoringUpdate,
    user_id: str = Depends(auth_protect_route),
):
    """Toggle monitoring for a specific Linear team."""
    supabase = get_supabase()
    installation = (
        supabase.table("linear_installations")
        .select("id")
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not installation or not installation.data:
        raise HTTPException(status_code=404, detail="Linear installation not found.")
    supabase.table("linear_teams").update(
        {"monitoring_enabled": req.monitoring_enabled}
    ).eq("installation_id", installation.data["id"]).eq("linear_team_id", team_id).execute()
    return {"team_id": team_id, "monitoring_enabled": req.monitoring_enabled}


@router.post("/teams/sync")
async def sync_linear_teams(user_id: str = Depends(auth_protect_route)):
    """Re-fetch teams from Linear and refresh linear_teams rows.

    Preserves existing monitoring_enabled states. Adds new teams as enabled=true.
    """
    supabase = get_supabase()
    row = (
        supabase.table("integrations")
        .select("access_token")
        .eq("user_id", user_id)
        .eq("provider", "linear")
        .maybe_single()
        .execute()
    )
    if not row or not row.data:
        raise HTTPException(status_code=404, detail="Linear integration not found.")

    access_token = decrypt_token(row.data["access_token"])
    await _seed_linear_teams(user_id, access_token)

    # Return the refreshed team list
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
    return {"teams": teams}


@router.delete("")
async def linear_disconnect(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    row = supabase.table("integrations").select("access_token").eq("user_id", user_id).eq("provider", "linear").maybe_single().execute()
    if row and row.data:
        try:
            token = decrypt_token(row.data["access_token"])
            async with httpx.AsyncClient() as client:
                await client.post("https://api.linear.app/oauth/revoke", data={"access_token": token})
        except Exception as e:
            print(f"[linear] token revocation failed (continuing disconnect): {e}")
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "linear").execute()
    queue.enqueue(deprovision_skill, user_id, "linear")
    return {"status": "disconnected"}
