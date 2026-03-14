from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.deps import auth_protect_route
from app.db.supabase_client import get_supabase
from app.db.projects import get_or_create_default_project
from app.db.agent_sessions import create_agent_session, list_sessions_for_user, update_session_fields, delete_session, mark_session_read
from app.db.conversations import get_conversation_items

router = APIRouter()


class UpdateSessionRequest(BaseModel):
    display_name: str | None = None
    is_pinned: bool | None = None


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

    project_id, workspace_id = get_or_create_default_project(
        supabase,
        organization_id=organization_id,
        user_id=user_id,
    )

    agent_session_id = create_agent_session(
        supabase,
        organization_id=organization_id,
        user_id=user_id,
        project_id=project_id,
        workspace_id=workspace_id,
    )

    return {"agent_session_id": agent_session_id, "workspace_id": workspace_id}


@router.get("/sessions")
def list_sessions(user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    sessions = list_sessions_for_user(supabase, user_id=user_id)
    return sessions


@router.patch("/sessions/{session_id}")
def update_session(session_id: str, body: UpdateSessionRequest, user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    ok = update_session_fields(
        supabase,
        session_id=session_id,
        user_id=user_id,
        fields=body.model_dump(exclude_none=True),
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/sessions/{session_id}/read")
def read_session(session_id: str, user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    mark_session_read(supabase, session_id=session_id, user_id=user_id)
    return {"ok": True}


@router.delete("/sessions/{session_id}")
def remove_session(session_id: str, user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()
    ok = delete_session(supabase, session_id=session_id, user_id=user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.get("/sessions/{session_id}/messages")
def get_session_messages(session_id: str, user_id: str = Depends(auth_protect_route)):
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
