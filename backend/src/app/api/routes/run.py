from __future__ import annotations
# from re import T

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from uuid import uuid4
from pathlib import Path

from app.state_store import FileStateStore
from app.agents.orchestrator import run_orchestrator

router = APIRouter()
TENANT_ID = "local"
# local_state will be at repo root for now
REPO_ROOT = Path(__file__).resolve().parents[4]
store = FileStateStore(base_dir=REPO_ROOT / "local_state", tenant_id=TENANT_ID)

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
    agent_session_id, workspace_id = store.get_or_create_session(req.agent_session_id)
    store.append_message(agent_session_id, role="user", content=req.prompt)
    try:
        output = await run_orchestrator(
            prompt=req.prompt,
            tenant_id=TENANT_ID,
            agent_session_id=agent_session_id,
            workspace_id=workspace_id,
        )
        store.append_message(agent_session_id, role="assistant", content=output)
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
            output="ERROR"
        )
