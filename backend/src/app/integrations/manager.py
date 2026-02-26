from datetime import datetime, timezone, timedelta
from typing import Optional
from app.integrations.crypto import encrypt_token, decrypt_token
from app.config import settings
import httpx

async def get_valid_token(supabase, *, user_id: str, provider: str) -> str:
    """
    Returns a valid, decrypted access token for the given user + provider.
    Automatically refreshes if expired. Raises if no integration exists.
    """
    result = (
        supabase.table("integrations")
        .select("*")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .single()
        .execute()
    )
    integration = result.data

    if not integration:
        raise Exception(f"No integration found for provider: {provider}")

    if integration.get("expires_at"):
        expires_at = datetime.fromisoformat(integration["expires_at"].replace("Z", "+00:00"))
        if expires_at <= datetime.now(timezone.utc) + timedelta(minutes=5):
            refresh_token = decrypt_token(integration["refresh_token"])
            new_tokens = await _refresh_token(provider, refresh_token)
            
            update_data = {
                "access_token": encrypt_token(new_tokens["access_token"]),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if "refresh_token" in new_tokens:
                update_data["refresh_token"] = encrypt_token(new_tokens["refresh_token"])
            if "expires_at" in new_tokens:
                update_data["expires_at"] = new_tokens["expires_at"]
                
            supabase.table("integrations").update(update_data).eq("id", integration["id"]).execute()
            return new_tokens["access_token"]

    return decrypt_token(integration["access_token"])

async def _refresh_token(provider: str, refresh_token: str) -> dict:
    """Internal helper to refresh OAuth tokens."""
    providers = {
        "linear": refresh_linear_token,
        "google": refresh_google_token,
        "notion": refresh_notion_token,
    }
    
    refresh_func = providers.get(provider)
    if not refresh_func:
        raise NotImplementedError(f"Refresh logic not implemented for: {provider}")
        
    return await refresh_func(refresh_token)

async def refresh_linear_token(refresh_token: str) -> dict:
    """Helper to refresh Linear token witht their OAuth structure."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.linear.app/oauth/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.linear_client_id,
                "client_secret": settings.linear_client_secret,
            },
        )
        response.raise_for_status()
        data = response.json()
        print(f"response data from linear refresh token request:\n{data}\n")

        result = {"access_token": data["access_token"]}

        if "refresh_token" in data:
            result["refresh_token"] = data["refresh_token"]
        if "expires_in" in data:
            expires_at = datetime.now(timezone.utc).timestamp() + data["expires_in"]
            result["expires_at"] = datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat()
        return result

async def refresh_google_token(refresh_token: str) -> dict:
    """Helper to refresh Google token with their OAuth structure."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
            },
        )
        response.raise_for_status()
        data = response.json()

        result = {"access_token": data["access_token"]}

        if "refresh_token" in data:
            result["refresh_token"] = data["refresh_token"]
        if "expires_in" in data:
            expires_at = datetime.now(timezone.utc).timestamp() + data["expires_in"]
            result["expires_at"] = datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat()
        return result

async def refresh_notion_token(refresh_token: str) -> dict:
    """Helper to refresh Notion token."""
    # Notion uses Basic Auth for token endpoint
    auth = httpx.BasicAuth(settings.notion_client_id, settings.notion_client_secret)
    
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.notion.com/v1/oauth/token",
            json={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
            },
            auth=auth,
            headers={"Notion-Version": "2022-06-28"}
        )
        response.raise_for_status()
        data = response.json()
        
        result = {"access_token": data["access_token"]}
        
        if "refresh_token" in data:
            result["refresh_token"] = data["refresh_token"]
            
        if "expires_in" in data:
             expires_at = datetime.now(timezone.utc).timestamp() + data["expires_in"]
             result["expires_at"] = datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat()
             
        return result
