from app.config import settings
from supabase import create_client, Client

def get_supabase() -> Client:
    url = settings.supabase_url
    key = settings.supabase_secret_key
    return create_client(url, key)