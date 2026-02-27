from supabase import Client

def append_conversation_item(
    supabase: Client,
    *,
    agent_session_id: str,
    item: dict,
    parent_id: str | None = None,
    source_platform: str = "web",
    source_channel_id: str | None = None,
) -> str:
    """Insert a conversation item and return its generated id."""
    payload: dict = {
        "agent_session_id": agent_session_id,
        "item": item,
        "source_platform": source_platform,
    }
    if parent_id is not None:
        payload["parent_id"] = parent_id
    if source_channel_id is not None:
        payload["source_channel_id"] = source_channel_id
    response = (
        supabase.table("conversation_items")
        .insert(payload)
        .execute()
    )
    return response.data[0]["id"]

def get_conversation_items(
    supabase: Client,
    *,
    agent_session_id: str,
    limit: int | None = None,
) -> list[dict]:
    query = (
        supabase.table("conversation_items")
        .select("item")
        .eq("agent_session_id", agent_session_id)
        .order("created_at", desc=False)
    )
    if limit is not None:
        query = query.limit(limit)
    response = query.execute()
    rows = response.data or []
    return [row["item"] for row in rows]

def get_conversation_chain(
    supabase: Client,
    *,
    leaf_item_id: str,
) -> list[dict]:
    """
    Walk the parent_id chain from leaf_item_id back to the root and return
    the items in chronological order (root first).

    Uses a Postgres recursive CTE via rpc so we can do this in a single query.
    """
    response = supabase.rpc(
        "get_conversation_chain",
        {"leaf_id": leaf_item_id},
    ).execute()
    rows = response.data or []
    return [row["item"] for row in rows]
