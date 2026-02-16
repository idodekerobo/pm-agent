from supabase import Client

def append_conversation_item(
    supabase: Client,
    *,
    agent_session_id: str,
    item: dict,
) -> None:
    supabase.table("conversation_items").insert(
        {"agent_session_id": agent_session_id, "item": item}
    ).execute()

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