"""Supabase Storage helpers for conversation image attachments."""

import uuid

from app.config import settings
from app.db.supabase_client import get_supabase

BUCKET = "conversation-attachments"


def upload_attachment(
    user_id: str,
    data: bytes,
    filename: str,
    content_type: str,
    session_id: str | None = None,
) -> str:
    """Upload bytes to Supabase Storage and return the public URL.

    Path format: {user_id}/{session_id}/{uuid}.{ext}
    Falls back to {user_id}/{uuid}.{ext} when session_id is not yet known.
    """
    supabase = get_supabase()
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    original_name = filename.rsplit(".", 1)[0] if "." in filename else filename
    file_uuid = str(uuid.uuid4())
    path = (
        f"{user_id}/{session_id}/{file_uuid}-{original_name}.{ext}"
        if session_id
        else f"{user_id}/{file_uuid}-{original_name}.{ext}"
    )
    supabase.storage.from_(BUCKET).upload(path, data, {"content-type": content_type})
    return f"{settings.supabase_url}/storage/v1/object/public/{BUCKET}/{path}"
