from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from uuid import uuid4

from app.agents.orchestrator import run_orchestrator
from app.db.supabase_client import get_supabase
from app.db.agent_sessions import get_or_create_agent_session
from app.db.conversations import append_conversation_item, get_conversation_items

router = APIRouter()
TENANT_ID = "local"

MAX_HISTORY_ITEMS = 50

class RunRequest(BaseModel):
    prompt: str
    agent_session_id: Optional[str] = None

class RunResponse(BaseModel):
    agent_session_id: str
    workspace_id: str
    run_id: str
    output: str

@router.post("/run", response_model=RunResponse)
async def run(req: RunRequest) -> RunResponse:
    run_id = str(uuid4())
    supabase = get_supabase()  # TODO: when auth is implemented, validate tenant/user here

    agent_session_id, workspace_id = get_or_create_agent_session(
        supabase,
        tenant_id=TENANT_ID,
        agent_session_id=req.agent_session_id,
    )

    history_items = get_conversation_items(
        supabase,
        agent_session_id=agent_session_id,
        limit=MAX_HISTORY_ITEMS,
    )

    user_item: dict = {
        "type": "message",
        "role": "user",
        "content": [{"type": "input_text", "text": req.prompt}],
    }
    append_conversation_item(
        supabase,
        agent_session_id=agent_session_id,
        item=user_item,
    )
    try:
        output = await run_orchestrator(
            input_items=history_items + [user_item],
            tenant_id=TENANT_ID,
            agent_session_id=agent_session_id,
            workspace_id=workspace_id,
        )
        assistant_item: dict = {
            "type": "message",
            "role": "assistant",
            "content": [{"type": "input_text", "text": output}],
        }
        append_conversation_item(
            supabase,
            agent_session_id=agent_session_id,
            item=assistant_item,
        )
        return RunResponse(
            agent_session_id=agent_session_id,
            workspace_id=workspace_id,
            run_id=run_id,
            output=output,
        )
    except FileNotFoundError as file_not_found_err:
        print(f"FileNotFoundError: {file_not_found_err}")
    except Exception as e:
        print(f"Error: {e}")
        return RunResponse(
            agent_session_id=agent_session_id,
            workspace_id=workspace_id,
            run_id=run_id,
            output="ERROR",
        )
