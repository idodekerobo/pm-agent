"""
Demo agent context builder.

Unlike the full product agent (which resolves a Modal workspace, loads context
files from a Volume, and spins up sub-agents), the demo agent is intentionally
lightweight:
  - Runs directly as a single Agent (no execution_agent / researcher_agent)
  - Only tool: tool_fetch_url (direct HTTP call — no Modal sandbox needed)
  - No workspace Volume or file I/O
  - Placeholder IDs so AgentContext is satisfied without real DB rows

This file mirrors the role of context.py but for anonymous demo users.
"""
from __future__ import annotations

from typing import AsyncGenerator

from agents import Agent, Runner, ItemHelpers

from app.agents.context import AgentContext, AgentRunPayload
from app.agents.tools import tool_fetch_url

# ---------------------------------------------------------------------------
# Sentinel IDs — never written to the real DB
# ---------------------------------------------------------------------------
DEMO_USER_ID = "demo"
DEMO_ORG_ID = "demo"
DEMO_WORKSPACE_ID = "demo"

MODEL_ID = "gpt-5.2"
MAX_DEMO_TURNS = 2  # 1 initial analysis + 1 follow-up reply

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------
DEMO_SYSTEM_PROMPT = """\
You are Draft, an AI product manager. You help founders and PMs think through
product strategy, write PRDs, define specs, and turn ideas into execution plans.

## Current context
A visitor has shared their product URL with you. Your job is to:
1. Read the page (use the fetch_url tool — always fetch the URL to ground your
   analysis in real content, do not guess).
   a. You can run fetch_url multilpe times if needed, but avoid getting things like:
       privacy pages, terms of use, etc.
2. Identify what the product does, who it serves, and what stage it appears to
   be at.
3. Answer the visitor's specific question with sharp, opinionated PM thinking.
   Be concrete: name trade-offs, call out risks, suggest next steps.

## Tone
- Sharp and direct — like a senior PM who respects the founder's time.
- Opinionated: give a clear recommendation, not a list of "it depends".
- Brief but substantive: 3–5 sentences for short questions, a structured list
  for complex ones. Never pad. Keep things concise.

## Upgrade hooks
Weave in authentic, contextual nudges to sign up at natural moments:
- After delivering the analysis: "Want to turn this into a full PRD and open a
  GitHub issue for the first sprint? Sign up and connect your GitHub — Draft can
  draft the spec and hand it off to your coding agent in one command."
- If the question involves team execution: "Draft can push tasks directly to
  Linear or Slack once you connect your integrations — takes 2 minutes to set up."
- On the follow-up reply: "This is the kind of context that makes Draft genuinely
  useful over time. Sign up and it learns your stack, your team, and your roadmap —
  so you stop re-explaining yourself every time."

Only add one nudge per response, and only when it fits naturally. Never hard-sell.

## What you can do in the full product (mention only when relevant)
- Write and version PRDs, specs, and strategy docs in your workspace and in connected tools like Notion and Google Drive
- Create Linear issues, Notion databases, and more from a single prompt
- Spawn a coding agent to open a GitHub PR from a spec
- Maintain persistent memory of your product, team, and context across sessions
- Send comms via Slack when features are complete or you run into issues
"""

# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------

def build_demo_agent_payload(*, demo_session_id: str) -> AgentRunPayload:
    """
    Build a minimal AgentRunPayload for the demo agent.
    Uses placeholder IDs — no DB resolution needed.
    """
    ctx = AgentContext(
        organization_id=DEMO_ORG_ID,
        user_id=DEMO_USER_ID,
        workspace_id=DEMO_WORKSPACE_ID,
        sandbox_id=None,
        agent_session_id=demo_session_id,
    )
    return AgentRunPayload(
        organization_id=DEMO_ORG_ID,
        user_id=DEMO_USER_ID,
        agent_session_id=demo_session_id,
        workspace_id=DEMO_WORKSPACE_ID,
        sandbox_id=None,
        agent_context=ctx,
        tools=[tool_fetch_url],
        active_providers=[],
    )


# ---------------------------------------------------------------------------
# Input builder
# ---------------------------------------------------------------------------

def build_demo_input(
    *,
    url: str,
    question: str,
    history: list[dict],  # list of {role: "user"|"assistant", content: str}
) -> list[dict]:
    """
    Construct the message list passed to Runner.run_streamed().

    First turn:
      system + user message that includes the URL and question.
    Follow-up turns:
      system + prior assistant output + new user message.

    The system message is always first and never stored.
    """
    system_msg = {"role": "system", "content": DEMO_SYSTEM_PROMPT}
    messages: list[dict] = [system_msg]

    if not history:
        # First turn — prime the agent with the URL
        messages.append({
            "role": "user",
            "content": (
                f"My product URL: {url}\n\n"
                f"My question: {question}"
            ),
        })
    else:
        # Subsequent turns — include prior exchange then new message
        for msg in history:
            messages.append({"role": msg["role"], "content": msg["content"]})
        messages.append({"role": "user", "content": question})

    return messages


# ---------------------------------------------------------------------------
# Agent runner — yields SSE-compatible dicts
# ---------------------------------------------------------------------------

async def run_demo_agent(
    *,
    url: str,
    question: str,
    history: list[dict],
    payload: AgentRunPayload,
) -> AsyncGenerator[dict, None]:
    """
    Stream demo agent responses as SSE-compatible dicts.

    Yields event dicts matching the format used by orchestrator_agent.py:
      {"type": "message",     "content": str}            — text delta
      {"type": "tool_call",   "name": str, "call_id": str, "label": str}
      {"type": "tool_output", "call_id": str}            — signals fetch done
      {"type": "final_output","content": str}            — full text
    run_usage is intentionally suppressed (no cost leakage to anonymous users).
    """
    agent = Agent(
        name="Draft Demo Agent",
        instructions=DEMO_SYSTEM_PROMPT,
        model=MODEL_ID,
        tools=[tool_fetch_url],
    )

    input_items = build_demo_input(url=url, question=question, history=history)

    result = Runner.run_streamed(
        agent,
        input=input_items,
        context=payload.agent_context,
        max_turns=10,
    )

    full_text = ""

    async for event in result.stream_events():
        if event.type == "raw_response_event":
            data = event.data
            if getattr(data, "type", None) == "response.output_text.delta":
                delta = getattr(data, "delta", None)
                if delta:
                    full_text += delta
                    yield {"type": "message", "content": delta}

        elif event.type == "run_item_stream_event":
            item = event.item

            if item.type == "tool_call_item":
                raw = item.raw_item
                tool_name = raw.name
                # Parse URL out of arguments for a human-readable label
                try:
                    import json as _json
                    args = _json.loads(raw.arguments) if isinstance(raw.arguments, str) else raw.arguments
                    fetched_url = args.get("url", url)
                except Exception:
                    fetched_url = url
                label = f"Reading {fetched_url}..."
                yield {
                    "type": "tool_call",
                    "name": tool_name,
                    "call_id": raw.call_id,
                    "label": label,
                }

            elif item.type == "tool_call_output_item":
                raw = item.raw_item
                call_id = raw.call_id if hasattr(raw, "call_id") else raw.get("call_id", "")
                yield {"type": "tool_output", "call_id": call_id}

            elif item.type == "message_output_item":
                text = ItemHelpers.text_message_output(item)
                if text:
                    full_text = text  # overwrite with canonical output

    if full_text:
        yield {"type": "final_output", "content": full_text}
