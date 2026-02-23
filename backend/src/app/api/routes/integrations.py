from datetime import datetime, timezone
from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from app.api.deps import auth_protect_route
from app.integrations.crypto import encrypt_token
from app.db.supabase_client import get_supabase
from app.config import settings

router = APIRouter(prefix="/integrations")

oauth = OAuth()
oauth.register(
    name="linear",
    client_id=settings.linear_client_id,
    client_secret=settings.linear_client_secret,
    authorize_url="https://linear.app/oauth/authorize",
    access_token_url="https://api.linear.app/oauth/token",
    client_kwargs={"scope": "read,write"},
)
# add auth protection to this route
@router.get("/linear/connect")
async def linear_connect(
    request: Request,
    user_id: str,
):
    print(f"request:\n{request}\n")
    request.session["connecting_user_id"] = user_id
    redirect_uri = request.url_for("linear_callback")
    return await oauth.linear.authorize_redirect(request, str(redirect_uri), actor="app")

# TODO: wrap in try/except
@router.get("/linear/callback", name="linear_callback")
async def linear_callback(request: Request):
    user_id = request.session.pop("connecting_user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=400, 
            detail="Session expired or user not found. Please try connecting again."
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
    # }, on_conflict="user_id,provider").execute() # TODO: add the user_id, provider unique constriant
    }).execute()

    return RedirectResponse(f"{settings.client_app_base_url}/?connected=linear")

@router.delete("/linear")
async def linear_disconnect(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "linear").execute()
    return {"status": "disconnected"}

oauth.register(
    name="google",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
    access_token_url="https://oauth2.googleapis.com/token",
    client_kwargs={"scope": "https://www.googleapis.com/auth/drive"}, # https://www.googleapis.com/auth/documents.readonly, https://www.googleapis.com/auth/drive.readonly, https://www.googleapis.com/auth/drive.metadata.readonly
)

@router.get("/google/connect")
async def google_connect(
    request: Request,
    user_id: str,
):
    print(f"request:\n{request}\n")
    request.session["connecting_user_id"] = user_id
    redirect_uri = request.url_for("google_callback")
    return await oauth.google.authorize_redirect(request, str(redirect_uri))

@router.get("/google/callback", name="google_callback")
async def google_callback(request: Request):
    user_id = request.session.pop("connecting_user_id", None)
    if not user_id:
        raise HTTPException(
            status_code=400, 
            detail="Session expired or user not found. Please try connecting again."
        )

    token = await oauth.google.authorize_access_token(request)
    supabase = get_supabase()

    account_label = token.get("userinfo", {}).get("email", "Google Account")

    expires_at = None
    if "expires_in" in token:
        expires_timestamp = datetime.now(timezone.utc).timestamp() + token["expires_in"]
        expires_at = datetime.fromtimestamp(expires_timestamp, tz=timezone.utc).isoformat()

    supabase.table("integrations").upsert({
        "user_id": user_id,
        "provider": "google",
        "account_label": account_label,
        "access_token": encrypt_token(token["access_token"]),
        "refresh_token": encrypt_token(token.get("refresh_token", "")),
        "expires_at": expires_at,
        "scopes": token.get("scope", "").split() if isinstance(token.get("scope"), str) else [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return RedirectResponse(f"{settings.client_app_base_url}/?connected=google")

@router.delete("/google")
async def google_disconnect(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    supabase.table("integrations").delete().eq("user_id", user_id).eq("provider", "google").execute()
    return {"status": "disconnected"}

@router.get("/")
async def list_integrations(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    result = (
        supabase.table("integrations")
        .select("provider, account_label, scopes, created_at")
        .eq("user_id", user_id)
        .execute()
    )
    return result.data
