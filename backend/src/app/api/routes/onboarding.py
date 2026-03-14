"""
Onboarding routes — unauthenticated, called before account creation.

POST /onboarding/scrape
  Fetches a company URL via Jina reader and streams back 3-4 product observations
  as SSE. No tools, no agent framework overhead — just a direct LLM call.
  Used in Step 1 of the new experiential onboarding flow.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.utils.web_fetch import fetch_url

router = APIRouter(prefix="/onboarding", tags=["onboarding"])

MODEL_ID = "gpt-5.2"

SCRAPE_SYSTEM_PROMPT = """\
You are analyzing a company's product page to help onboard a new user to Draft AI.

Your job: write exactly 3–4 sharp, specific observations about the company or product
based solely on the page content provided. These will be shown to the user so they can
confirm your understanding before continuing.

Format rules:
- One observation per line, each starting with "• "
- Be specific — use the actual product name, customer type, and any metrics or stage signals visible
- Avoid vague generalities like "they help businesses" or "they offer solutions"
- If the page is clearly a large corporation's homepage (e.g. Amazon, Meta, Atlassian, Google),
  call this out explicitly and ask the user to clarify their specific team or product area:
  e.g. "• This looks like [Company]'s main homepage — your specific focus area likely isn't
  captured here. Could you tell me more about which team or product you work on?"
- If the page content is empty, returns an error, or is clearly not a product page,
  write a single observation: "• I wasn't able to read that page clearly."

Do not add any preamble, headers, or closing text — only the bullet observations.
"""


class ScrapeRequest(BaseModel):
    url: str
    full_name: str


@router.post("/scrape")
async def onboarding_scrape(req: ScrapeRequest):
    """
    Unauthenticated. Fetches the URL via Jina reader then streams LLM observations as SSE.
    """
    async def event_generator():
        def _sse(data: dict) -> str:
            return f"data: {json.dumps(data)}\n\n"

        # --- Fetch page content ---
        try:
            normalized = req.url.strip()
            if not normalized.startswith("http"):
                normalized = f"https://{normalized}"
            page_content = await fetch_url(normalized)
        except Exception:
            yield _sse({"type": "error", "content": "scrape_failed"})
            return

        if not page_content or len(page_content.strip()) < 100:
            yield _sse({"type": "error", "content": "scrape_failed"})
            return

        # --- Stream LLM observations ---
        from agents import Agent, Runner

        user_message = (
            f"The user's name is {req.full_name}.\n\n"
            f"Page content:\n\n{page_content}"
        )

        agent = Agent(
            name="Onboarding Scrape Agent",
            instructions=SCRAPE_SYSTEM_PROMPT,
            model=MODEL_ID,
            tools=[],
        )

        try:
            result = Runner.run_streamed(
                agent,
                input=[{"role": "user", "content": user_message}],
                max_turns=1,
            )

            async for event in result.stream_events():
                if event.type == "raw_response_event":
                    data = event.data
                    if getattr(data, "type", None) == "response.output_text.delta":
                        delta = getattr(data, "delta", None)
                        if delta:
                            yield _sse({"type": "message", "content": delta})
                            await asyncio.sleep(0)

            yield _sse({"type": "done"})

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
