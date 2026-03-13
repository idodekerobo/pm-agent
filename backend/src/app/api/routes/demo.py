"""
Demo routes — unauthenticated live demo on the landing page.

POST /demo/run   — anonymous SSE stream (max 2 turns per session)
POST /demo/claim — authenticated; links demo session to a newly-signed-up user
"""
from __future__ import annotations

import asyncio
import json
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, HttpUrl

from app.agents.demo_context import (
    MAX_DEMO_TURNS,
    build_demo_agent_payload,
    run_demo_agent,
)
from app.api.deps import auth_protect_route
from app.db.demo_sessions import (
    append_demo_items,
    claim_demo_session,
    create_demo_session,
    get_demo_session_by_token,
    increment_turn_count,
)
from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/demo", tags=["demo"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class DemoRunRequest(BaseModel):
    url: str                           # product URL (validated client-side)
    question: str
    history: list[dict] = []           # [{role, content}, ...] from prior turns
    demo_token: Optional[str] = None   # None on first turn; present on follow-ups


class DemoClaimRequest(BaseModel):
    demo_token: str


# ---------------------------------------------------------------------------
# POST /demo/run
# ---------------------------------------------------------------------------

@router.post("/run")
async def demo_run(req: DemoRunRequest):
    supabase = get_supabase()

    # ------------------------------------------------------------------ #
    # Session management                                                   #
    # ------------------------------------------------------------------ #
    session_row: dict | None = None
    is_new_session = False

    if req.demo_token:
        session_row = get_demo_session_by_token(supabase, demo_token=req.demo_token)
        if not session_row:
            # Token supplied but not found / expired — treat as new session
            pass

    if session_row is None:
        # First turn — create a new demo session
        session_row = create_demo_session(supabase, company_url=req.url)
        is_new_session = True
    else:
        # Existing session — check turn limit before incrementing
        if session_row["turn_count"] >= MAX_DEMO_TURNS:
            raise HTTPException(
                status_code=403,
                detail="Demo turn limit reached. Sign up to continue.",
            )
        session_row = increment_turn_count(supabase, demo_token=session_row["demo_token"])
        if not session_row:
            raise HTTPException(status_code=404, detail="Demo session not found.")

    demo_token: str = session_row["demo_token"]
    demo_session_id: str = str(session_row["id"])

    # ------------------------------------------------------------------ #
    # Build agent payload                                                  #
    # ------------------------------------------------------------------ #
    payload = build_demo_agent_payload(demo_session_id=demo_session_id)

    # ------------------------------------------------------------------ #
    # SSE stream                                                           #
    # ------------------------------------------------------------------ #
    async def event_generator() -> AsyncGenerator[str, None]:
        def _sse(data: dict) -> str:
            return f"data: {json.dumps(data)}\n\n"

        try:
            # Emit session_created on first turn so the client can persist the token
            if is_new_session:
                yield _sse({"type": "session_created", "demo_token": demo_token, "demo_session_id": demo_session_id})
                await asyncio.sleep(0)  # flush

            assistant_reply = ""
            async for event in run_demo_agent(
                url=req.url,
                question=req.question,
                history=req.history,
                payload=payload,
            ):
                yield _sse(event)
                await asyncio.sleep(0)
                # Capture the final complete text (prefer final_output over accumulated deltas)
                if event.get("type") == "final_output":
                    assistant_reply = event.get("content", "")
                elif event.get("type") == "message" and not assistant_reply:
                    assistant_reply += event.get("content", "")

            # Persist full conversation after stream completes
            if assistant_reply:
                full_items = list(req.history) + [
                    {"role": "user", "content": req.question},
                    {"role": "assistant", "content": assistant_reply},
                ]
                try:
                    append_demo_items(supabase, demo_token=demo_token, items=full_items)
                except Exception:
                    pass  # best-effort — don't fail the response

        except Exception as e:
            yield _sse({"type": "error", "content": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# POST /demo/claim
# ---------------------------------------------------------------------------

@router.post("/claim")
async def demo_claim(req: DemoClaimRequest, user_id: str = Depends(auth_protect_route)):
    supabase = get_supabase()

    row = claim_demo_session(supabase, demo_token=req.demo_token, user_id=user_id)
    if not row:
        # Either already claimed, expired, or not found — not a hard error for the
        # signup flow; the user is already registered and can use the product.
        return {"claimed": False, "message": "Session not found, expired, or already claimed."}

    # Optionally back-fill company_url on the user profile so the product is
    # pre-seeded with the URL they analysed in the demo.
    company_url = row.get("company_url")
    if company_url:
        try:
            supabase.table("users").update({"company_url": company_url}).eq("id", user_id).execute()
        except Exception:
            pass  # Best-effort; don't fail the claim if the column doesn't exist yet

    return {"claimed": True, "company_url": company_url}
