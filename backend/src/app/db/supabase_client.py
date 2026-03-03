from app.config import settings
from supabase import create_client, Client

_supabase_client = None

def get_supabase() -> Client:
    """
    Get or create a Supabase client.
    Uses a cached client to avoid connection initialization issues that occur
    when creating new httpx clients repeatedly in worker processes.
    """
    # TODO: For data reads/writes on user-owned rows, consider adding a get_supabase_for_user(user_jwt: str) variant that builds a short-lived
    # client using the publishable key + user JWT so that RLS policies are enforced at the database level.
    # Note: some operations MUST keep using the secret key (service role):
    #   - Storage: bucket creation/deletion and any server-side file processing
    #   - Auth admin: creating/deleting users, generating magic links (auth.admin.*)
    #   - Any cross-user query (e.g. Slack bot looking up a user by team ID)
    # A safe split: use user-scoped client for CRUD on owned rows, keep the secret-key client for everything listed above.
    global _supabase_client

    if _supabase_client is None:
        url = settings.supabase_url
        key = settings.supabase_secret_key
        _supabase_client = create_client(url, key)

    return _supabase_client