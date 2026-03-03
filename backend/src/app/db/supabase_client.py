from app.config import settings
from supabase import create_client, Client


def get_supabase() -> Client:
    """
    Create a Supabase client.
    """
    # TODO: For data reads/writes on user-owned rows, consider adding a get_supabase_for_user(user_jwt: str) variant that builds a short-lived
    # client using the publishable key + user JWT so that RLS policies are enforced at the database level.
    # Note: some operations MUST keep using the secret key (service role):
    #   - Storage: bucket creation/deletion and any server-side file processing
    #   - Auth admin: creating/deleting users, generating magic links (auth.admin.*)
    #   - Any cross-user query (e.g. Slack bot looking up a user by team ID)
    # A safe split: use user-scoped client for CRUD on owned rows, keep the secret-key client for everything listed above.
    return create_client(settings.supabase_url, settings.supabase_secret_key)