from fastapi import APIRouter, Depends

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase
from app.db.projects import get_or_create_default_project
from app.db.agent_sessions import get_or_create_agent_session, list_sessions_for_user
from app.db.conversations import get_conversation_items

router = APIRouter()


@router.post("/sessions")
def create_session(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()

    user_row = (
        supabase.table("users")
        .select("organization_id")
        .eq("id", user_id)
        .single()
        .execute()
    )
    if not user_row.data:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User not found")

    organization_id = user_row.data.get("organization_id") or "local"

    project_id, _ = get_or_create_default_project(
        supabase,
        organization_id=organization_id,
        user_id=user_id,
    )

    agent_session_id, workspace_id = get_or_create_agent_session(
        supabase,
        organization_id=organization_id,
        user_id=user_id,
        project_id=project_id,
        agent_session_id=None,
    )

    return {"agent_session_id": agent_session_id, "workspace_id": workspace_id}


@router.get("/sessions")
def list_sessions(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    sessions = list_sessions_for_user(supabase, user_id=user_id)
    return sessions


@router.get("/sessions/{session_id}/messages")
def get_session_messages(session_id: str, user_id: str = Depends(auth_protect_route)):
    from fastapi import HTTPException
    supabase = get_supabase()
    session_row = (
        supabase.table("agent_sessions")
        .select("user_id")
        .eq("id", session_id)
        .maybe_single()
        .execute()
    )
    if not session_row.data or session_row.data["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    items = get_conversation_items(supabase, agent_session_id=session_id)
    return items
