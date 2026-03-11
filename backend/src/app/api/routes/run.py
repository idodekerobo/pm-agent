from __future__ import annotations

import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, AsyncGenerator

from app.agents.context import build_agent_run_payload
from app.agents.orchestrator_agent import run_orchestrator
from app.db.supabase_client import get_supabase
from app.db.conversations import append_conversation_item, get_conversation_items, get_conversation_chain, make_user_item, make_assistant_item
from app.db.workspaces import set_workspace_agent_run_status
from app.db.billing import deduct_credit
from app.billing import get_billing_account_and_balance, record_model_usage
from app.api.deps import auth_protect_route
from app.errors import log_error

router = APIRouter()

MAX_HISTORY_ITEMS = 50

class SessionMetadata(BaseModel):
    timezone: Optional[str] = None
    location: Optional[str] = None


class RunRequest(BaseModel):
    prompt: str
    agent_session_id: Optional[str] = None
    parent_item_id: Optional[str] = None
    session_metadata: Optional[SessionMetadata] = None

class RunResponse(BaseModel):
    agent_session_id: str
    workspace_id: str
    run_id: str
    output: str

@router.post("/run")
async def run(req: RunRequest, user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()

    billing_account, balance = get_billing_account_and_balance(supabase, user_id=user_id)
    if not billing_account or balance <= 0:
        raise HTTPException(status_code=402, detail="Insufficient credits.")

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

    user_item = make_user_item(req.prompt)
    user_item_id = append_conversation_item(
        supabase,
        agent_session_id=payload.agent_session_id,
        item=user_item,
        parent_id=req.parent_item_id,
    )

    # Build ephemeral system context — prepended every turn, never saved to DB
    system_item = _build_web_system_item(req.session_metadata)
    input_items = ([system_item] if system_item else []) + _sanitize_for_model(history_items) + [user_item]

    async def event_generator() -> AsyncGenerator[str, None]:
        final_output = ""
        usage_data: dict | None = None
        if req.agent_session_id is None:
            yield f"data: {json.dumps({'type': 'session_created', 'agent_session_id': payload.agent_session_id})}\n\n"
        yield f"data: {json.dumps({'type': 'item_created', 'role': 'user', 'id': user_item_id})}\n\n"
        set_workspace_agent_run_status(supabase, workspace_id=str(payload.workspace_id), status="running")
        try:
            async for event in run_orchestrator(
                input_items=input_items,
                payload=payload,
            ):
                if event["type"] == "run_usage":
                    usage_data = event  # capture for telemetry; never stream to client
                    continue

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
                ledger_id: str | None = None
                try:
                    ledger_id = deduct_credit(
                        supabase,
                        billing_account_id=str(billing_account.id),
                        agent_session_id=payload.agent_session_id,
                    )
                except Exception as e:
                    await log_error(user_id, "billing", e, context={"session_id": payload.agent_session_id})
                if usage_data:
                    try:
                        record_model_usage(
                            supabase,
                            billing_account=billing_account,
                            agent_session_id=payload.agent_session_id,
                            organization_id=payload.organization_id,
                            usage_data=usage_data,
                            ledger_id=ledger_id,
                        )
                    except Exception as e:
                        await log_error(user_id, "billing", e, context={"session_id": payload.agent_session_id})
        except Exception as e:
            await log_error(user_id, "agent", e, context={
                "session_id": payload.agent_session_id,
            })
            yield f"data: {json.dumps({'type': 'error', 'content': f'An error occurred: {str(e)}'})}\n\n"
        finally:
            set_workspace_agent_run_status(supabase, workspace_id=str(payload.workspace_id), status="idle")

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _sanitize_for_model(items: list[dict]) -> list[dict]:
    """Convert internal item types that the model doesn't understand into standard message items.

    Items like code_task_update are written by background workers for the frontend's
    benefit. They're valid in our DB but not valid OpenAI input types. Converting them
    to 'message' preserves the context (the model knows a task ran and what happened)
    without triggering a 400 from the API.
    """
    INTERNAL_TYPES = {"code_task_update"}
    result = []
    for item in items:
        if item.get("type") in INTERNAL_TYPES:
            result.append({
                "type": "message",
                "role": item.get("role", "assistant"),
                "content": item.get("content", []),
            })
        else:
            result.append(item)
    return result


def _build_web_system_item(metadata: Optional[SessionMetadata]) -> Optional[dict]:
    if not metadata:
        return None
    from datetime import datetime
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    tz_name = metadata.timezone or "UTC"
    try:
        tz = ZoneInfo(tz_name)
    except (ZoneInfoNotFoundError, KeyError):
        tz = ZoneInfo("UTC")

    now = datetime.now(tz)
    time_str = now.strftime("%A, %B %-d %Y, %I:%M %p") + f" ({tz_name})"

    parts = ["[Session Context]", "Platform: Web App", f"Time: {time_str}"]
    if metadata.location:
        parts.append(f"Location: {metadata.location} (approximate)")

    return {"type": "message", "role": "system", "content": [{"type": "input_text", "text": "\n".join(parts)}]}
