from __future__ import annotations

import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator
from uuid import uuid4

from app.agents.context import build_agent_run_payload
from app.agents.orchestrator import run_orchestrator
from app.db.supabase_client import get_supabase
from app.db.conversations import append_conversation_item, get_conversation_items, get_conversation_chain, make_user_item, make_assistant_item
from app.api.deps import auth_protect_route

router = APIRouter()

MAX_HISTORY_ITEMS = 50

class RunRequest(BaseModel):
    prompt: str
    agent_session_id: Optional[str] = None
    parent_item_id: Optional[str] = None

class RunResponse(BaseModel):
    agent_session_id: str
    workspace_id: str
    run_id: str
    output: str

@router.post("/run")
async def run(req: RunRequest, user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()

    payload = build_agent_run_payload(
        supabase,
        user_id,
        agent_session_id=req.agent_session_id,
    )

    if req.parent_item_id:
        history_items = get_conversation_chain(supabase, leaf_item_id=req.parent_item_id)
    else:
        history_items = get_conversation_items(
            supabase,
            agent_session_id=payload.agent_session_id,
            limit=MAX_HISTORY_ITEMS,
        )

    print("conversation history:")
    print(history_items)

    user_item = make_user_item(req.prompt)
    user_item_id = append_conversation_item(
        supabase,
        agent_session_id=payload.agent_session_id,
        item=user_item,
        parent_id=req.parent_item_id,
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        final_output = ""
        if req.agent_session_id is None:
            yield f"data: {json.dumps({'type': 'session_created', 'agent_session_id': payload.agent_session_id})}\n\n"
        yield f"data: {json.dumps({'type': 'item_created', 'role': 'user', 'id': user_item_id})}\n\n"
        try:
            async for event in run_orchestrator(
                input_items=history_items + [user_item],
                payload=payload,
            ):
                if event["type"] == "final_output":
                    final_output = event["content"]

                if "db_item" in event:
                    append_conversation_item(
                        supabase,
                        agent_session_id=payload.agent_session_id,
                        item=event["db_item"],
                        parent_id=user_item_id,
                    )

                stream_event = {k: v for k, v in event.items() if k != "db_item"}
                yield f"data: {json.dumps(stream_event)}\n\n"

            if final_output:
                assistant_item_id = append_conversation_item(
                    supabase,
                    agent_session_id=payload.agent_session_id,
                    item=make_assistant_item(final_output),
                    parent_id=user_item_id,
                )
                yield f"data: {json.dumps({'type': 'item_created', 'role': 'assistant', 'id': assistant_item_id})}\n\n"
        except Exception as e:
            print(f"Error in stream: {e}")
            error_event = {
                "type": "error",
                "content": f"An error occurred: {str(e)}"
            }
            yield f"data: {json.dumps(error_event)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
