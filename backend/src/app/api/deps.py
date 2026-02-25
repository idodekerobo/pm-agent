from jwt import PyJWKClient, ExpiredSignatureError, InvalidTokenError, decode
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.config import settings

bearer_scheme = HTTPBearer()

_jwks_client = PyJWKClient(
    f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
    lifespan=1200,  # 20 min cache
)
# TODO: update this to work with supabase jwt and user_id being in the runrequest
def auth_protect_route(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """
    Validates the Supabase JWT (ES256/RS256) and returns the user's UUID.
    Validation is local — uses the cached public key, no Supabase round-trip.
    Use as FastAPI dependency on any route that requires auth.
    """
    token = credentials.credentials
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(token)
        payload = decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],  # supports RSA and EC curve keys
            options={"verify_aud": False},  # Supabase sets aud="authenticated", not a URL
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
