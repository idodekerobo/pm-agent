from app.config import settings
from supabase import create_client, Client

_supabase_client = None

def get_supabase() -> Client:
    """
    Get or create a Supabase client.
    Uses a cached client to avoid connection initialization issues that occur
    when creating new httpx clients repeatedly in worker processes.
    """
    global _supabase_client

    if _supabase_client is None:
        url = settings.supabase_url
        key = settings.supabase_secret_key
        _supabase_client = create_client(url, key)

    return _supabase_client