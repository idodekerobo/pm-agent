"""Write conversation_items to Supabase from the bridge.

Uses httpx directly against the Supabase REST API.
Auth: anon key (apikey header) + user JWT (Authorization header).
RLS policies on conversation_items allow the JWT owner to insert/read their own items.

httpx is already a bridge dependency (used by tls.py), so no extra deps needed.
"""

import httpx


async def write_item(
    supabase_url: str,
    anon_key: str,
    user_jwt: str,
    *,
    session_id: str,
    item: dict,
    parent_id: str | None = None,
) -> str:
    """Insert a conversation_item row and return its generated UUID."""
    payload: dict = {
        "agent_session_id": session_id,
        "item": item,
        "source_platform": "web",
    }
    if parent_id:
        payload["parent_id"] = parent_id

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{supabase_url}/rest/v1/conversation_items",
            json=payload,
            headers={
                "apikey": anon_key,
                "Authorization": f"Bearer {user_jwt}",
                "Content-Type": "application/json",
                "Prefer": "return=representation",
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()[0]["id"]


def make_user_item(text: str) -> dict:
    return {
        "type": "message",
        "role": "user",
        "content": [{"type": "input_text", "text": text}],
    }


def make_assistant_item(text: str) -> dict:
    return {
        "type": "message",
        "role": "assistant",
        "content": [{"type": "output_text", "text": text}],
    }
