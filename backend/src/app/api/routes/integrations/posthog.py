import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase
from app.integrations.crypto import encrypt_token
from app.workers.queue import queue
from app.workers.tasks import deprovision_skill, provision_skill

router = APIRouter(prefix="/posthog")

POSTHOG_BASE_URLS = {
    "us": "https://us.posthog.com",
    "eu": "https://eu.posthog.com",
}


class PostHogConnectRequest(BaseModel):
    api_key: str
    project_id: str
    region: Literal["us", "eu"] = "us"


@router.post("/connect")
async def posthog_connect(
    body: PostHogConnectRequest,
    user_id: str = Depends(auth_protect_route),
):
    api_key = body.api_key.strip()
    project_id = body.project_id.strip()

    if not api_key:
        raise HTTPException(status_code=422, detail="API key is required.")
    if not project_id:
        raise HTTPException(status_code=422, detail="Project ID is required.")

    base_url = POSTHOG_BASE_URLS[body.region]

    # Validate the key + project by fetching project metadata.
    # Requires Project Read scope on the personal API key.
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{base_url}/api/projects/{project_id}/",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=10,
        )

    if resp.status_code == 401:
        raise HTTPException(status_code=422, detail="Invalid API key.")
    if resp.status_code == 403:
        raise HTTPException(status_code=422, detail="API key does not have access to this project. Ensure Oraganization Read, Project Read, Query Read, Feature Flag Read, Experiments Read, Insights Read, and Cohort Read permissions are granted.")
    if resp.status_code == 404:
        raise HTTPException(status_code=422, detail="Project not found. Check your Project ID.")
    if resp.status_code != 200:
        raise HTTPException(status_code=422, detail="Could not verify PostHog credentials.")

    project_data = resp.json()
    account_label = project_data.get("name", f"Project {project_id}")

    supabase = get_supabase()

    # Delete any existing row first for a clean upsert
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "posthog").execute()

    supabase.table("integrations").insert({
        "user_id": user_id,
        "provider": "posthog",
        "account_label": account_label,
        "access_token": encrypt_token(api_key),
        "scopes": ["query:read", "feature_flag:read", "project:read", "organization:read", "experiment:read", "cohort:read", "insight:read"],
        "metadata": {"project_id": project_id, "region": body.region},
    }).execute()

    queue.enqueue(provision_skill, user_id, "posthog")

    return {"status": "connected", "account_label": account_label}


@router.delete("")
async def posthog_disconnect(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "posthog").execute()
    queue.enqueue(deprovision_skill, user_id, "posthog")
    return {"status": "disconnected"}
