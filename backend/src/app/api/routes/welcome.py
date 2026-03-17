"""
Welcome session — creates a pinned, agent-initiated session at the end of onboarding.

POST /welcome-session
  - Looks up the user's claimed demo session (if any)
  - Creates a regular session from the demo conversation (resumable in sidebar)
  - Creates a pinned welcome session (initiated_by='agent')
  - Fires a background task to generate the agent's opening message
  - Returns {welcome_session_id, demo_session_id}
"""
from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from typing import Optional

from agents import Agent, Runner, ItemHelpers

from app.api.deps import auth_protect_route
from app.billing import get_billing_account_and_balance
from app.db.billing import deduct_credit
from app.db.supabase_client import get_supabase
from app.db.projects import get_or_create_default_project
from app.db.agent_sessions import create_agent_session
from app.db.conversations import append_conversation_item, batch_append_conversation_items, make_assistant_item
from app.db.demo_sessions import get_claimed_demo_for_user

router = APIRouter()

MODEL_ID = "gpt-5.2"

WELCOME_SYSTEM_PROMPT = """\
You are Draft, an AI product manager. A new user just completed onboarding.
Your job is to write their first message — the opening note they see when they land in the product.

Follow this structure in order:

1. **What Draft is** (2–3 sentences). Lead with this — the user needs to understand what they have
   before anything else. Explain what makes Draft different from ChatGPT or Claude:
   - With other AI tools, you need to constantly bring them up to speed -> importing docs, dropping in data, giving it context.
     Draft is different because it stays up to speed by design.
     Its an agent that can work autonomously as well as doing one off tasks.
   - Draft builds persistent memory across sessions. It learns your product, team, and decisions
     and gets sharper the more you use it — unlike starting from scratch every time.
   - It connects to the tools you already use: Slack, Linear, Google Drive, Notion, GitHub, and more.
   - It creates real artifacts — PRDs, decision docs, competitive briefs, sprint issues — not just chat.

2. **Agent Files** (1–2 sentences). Tell them they can customize how their agent works: Settings →
   Agent Files contains document templates and skills they can edit or expand — new templates,
   integrations, or custom instructions shape how Draft works for their specific team.

3. **Background monitoring** (1–2 sentences). Tell them Draft will passively monitor their connected tools in the background —
   Slack channels, GitHub repos, Linear teams — and builds context between sessions without being
   asked. Explain how it works:
   - Reading messages in Slack channels that you invite the Draft PM Agent to, much the same way an employee would
   - Monitoring PR's in the Github repo's that it has access to, like a senior PM or Technical Product Lead would to understand what shipped
   - Seeing the updates on Linear issues to stay up to date on the teams work, like a good teammate would.
   Since they may not have connected tools yet, frame it as: "When you connect Slack, GitHub, or
   Linear, Draft will start learning from them in the background." Direct them to
   Settings → Integrations to see what it's watching and that they can control it per channel, repo, or team.

4. **Show you know their product** (1–2 sentences). Reference something concrete about their company
   or product — name it, call out their category, stage, or a sharp observation about their space.
   This signals Draft already has their context loaded.

5. **Demo callout** — ONLY include this if a "Prior demo conversation" section appears in the
   user context below. If it does, tell them definitively that conversation is saved in their
   sidebar and they can pick it up anytime. Do NOT hedge with "if you had" — state it as fact.

6. **One sharp question** (1 sentence). Based on their specific use cases and product, ask ONE
   actionable question that feels like the natural next step toward doing real work together.

Rules:
- Do NOT say "Welcome", "Hello", or introduce yourself.
- Keep it under 210 words.
- Do not use any tools — you have all the context you need in this message.
"""


# ---------------------------------------------------------------------------
# Request / Response
# ---------------------------------------------------------------------------

class ProfileData(BaseModel):
    full_name: str = ""
    role: str = ""
    company_url: str = ""
    onboarding_scrape_observations: str = ""
    onboarding_scrape_correction: str = ""
    current_focus: list[str] = []
    daily_activities: list[str] = []


class WelcomeSessionRequest(BaseModel):
    profile: ProfileData


class WelcomeSessionResponse(BaseModel):
    welcome_session_id: str
    demo_session_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _format_profile(p: ProfileData) -> str:
    parts = []
    if p.full_name:
        parts.append(f"Name: {p.full_name}")
    if p.role:
        parts.append(f"Role: {p.role}")
    if p.company_url:
        parts.append(f"Company URL: {p.company_url}")
    if p.current_focus:
        parts.append(f"Current focus: {', '.join(p.current_focus)}")
    if p.daily_activities:
        parts.append(f"Daily activities: {', '.join(p.daily_activities)}")
    if p.onboarding_scrape_observations:
        parts.append(f"Product observations:\n{p.onboarding_scrape_observations}")
    if p.onboarding_scrape_correction:
        parts.append(f"User correction to observations: {p.onboarding_scrape_correction}")
    return "\n".join(parts)


def _format_demo_transcript(items: list[dict]) -> str:
    """Convert stored demo items (SDK format) into a readable transcript."""
    lines = []
    for item in items:
        role = item.get("role")
        item_type = item.get("type", "")
        if item_type == "function_call":
            lines.append(f"[Agent fetched URL: {item.get('name', 'fetch_url')}]")
        elif item_type == "function_call_output":
            # TOOD: consider putting in the function call output because the url output may be useful and is already cleaned via jina
            pass  # skip raw tool output — too noisy for the context prompt
        elif role == "user":
            content = item.get("content", "")
            if isinstance(content, list):
                text = " ".join(c.get("text", "") for c in content if isinstance(c, dict))
            else:
                text = str(content)
            lines.append(f"User: {text}")
        elif role == "assistant":
            content = item.get("content", "")
            if isinstance(content, list):
                text = " ".join(
                    c.get("text", "") for c in content
                    if isinstance(c, dict) and c.get("type") == "output_text"
                )
            else:
                text = str(content)
            if text:
                lines.append(f"Agent: {text}")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Background task
# ---------------------------------------------------------------------------

async def name_demo_session(
    *,
    user_id: str,
    session_id: str,
    demo_items: list[dict],
) -> None:
    """Extract the first user message from demo_items and auto-name the demo session."""
    from app.agents.context import auto_name_session

    first_user_text = ""
    for item in demo_items:
        if item.get("role") == "user":
            content = item.get("content", "")
            if isinstance(content, list):
                first_user_text = " ".join(
                    c.get("text", "") for c in content if isinstance(c, dict)
                )
            else:
                first_user_text = str(content)
            if first_user_text.strip():
                break

    if first_user_text.strip():
        supabase = get_supabase()
        await auto_name_session(
            supabase,
            user_id=user_id,
            session_id=session_id,
            prompt=first_user_text,
        )


async def generate_welcome_message(
    *,
    user_id: str,
    welcome_session_id: str,
    profile: ProfileData,
    demo_items: list[dict] | None,
    company_url: str | None,
) -> None:
    """Runs after the response is sent. Generates and stores the welcome message."""
    supabase = get_supabase()

    billing_account, balance = get_billing_account_and_balance(supabase, user_id=user_id)
    if not billing_account or balance <= 0:
        return

    # Build the user message that gives the agent its context
    context_parts = ["## User profile", _format_profile(profile)]
    if demo_items:
        transcript = _format_demo_transcript(demo_items)
        if transcript:
            url_hint = f" (URL: {company_url})" if company_url else ""
            context_parts += [
                f"\n## Prior demo conversation{url_hint}",
                "Before signing up, the user had this conversation with Draft. "
                "Use it for context — do NOT repeat or summarize it. "
                "Reference that the conversation is saved in their sidebar.",
                transcript,
            ]

    user_content = "\n".join(context_parts)

    agent = Agent(
        name="Welcome Agent",
        instructions=WELCOME_SYSTEM_PROMPT,
        model=MODEL_ID,
        tools=[],
    )

    try:
        result = await Runner.run(
            agent,
            input=[{"role": "user", "content": user_content}],
            max_turns=1,
        )
        final_text = result.final_output if isinstance(result.final_output, str) else (
            ItemHelpers.text_message_output(result.final_output) if result.final_output else ""
        )
        if final_text:
            append_conversation_item(
                supabase,
                agent_session_id=welcome_session_id,
                item=make_assistant_item(final_text),
            )
            try:
                deduct_credit(
                    supabase,
                    billing_account_id=str(billing_account.id),
                    agent_session_id=welcome_session_id,
                )
            except Exception:
                pass
    except Exception:
        pass  # Background task — silent fail; user can still use the product


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.post("/welcome-session", response_model=WelcomeSessionResponse)
async def create_welcome_session(
    req: WelcomeSessionRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(auth_protect_route),
):
    supabase = get_supabase()

    # Resolve project + workspace (creates them if this is a brand-new user)
    user_row = (
        supabase.table("users")
        .select("organization_id")
        .eq("id", user_id)
        .single()
        .execute()
    )
    organization_id = (user_row.data or {}).get("organization_id") or "local"
    project_id, workspace_id = get_or_create_default_project(
        supabase,
        organization_id=organization_id,
        user_id=user_id,
    )

    # Fetch claimed demo session (may be None if user didn't do the landing demo)
    demo_row = get_claimed_demo_for_user(supabase, user_id=user_id)
    demo_items: list[dict] | None = demo_row.get("items") if demo_row else None
    company_url: str | None = demo_row.get("company_url") if demo_row else None

    # Create the pinned welcome session
    welcome_session_id = create_agent_session(
        supabase,
        organization_id=organization_id,
        user_id=user_id,
        project_id=project_id,
        workspace_id=workspace_id,
        is_pinned=True,
        initiated_by="agent",
        display_name="Welcome to Draft AI",
    )

    # Convert demo session into a regular resumable session (if demo exists)
    demo_session_id: str | None = None
    if demo_items:
        demo_session_id = create_agent_session(
            supabase,
            organization_id=organization_id,
            user_id=user_id,
            project_id=project_id,
            workspace_id=workspace_id,
            initiated_by="user",
        )
        # Batch-insert all demo items in one DB round trip
        batch_append_conversation_items(
            supabase,
            agent_session_id=demo_session_id,
            items=demo_items,
            source_platform="demo",
        )

    # Generate the welcome message in the background (after response is sent)
    background_tasks.add_task(
        generate_welcome_message,
        user_id=user_id,
        welcome_session_id=welcome_session_id,
        profile=req.profile,
        demo_items=demo_items,
        company_url=company_url,
    )

    # Auto-name the demo session from its first user message
    if demo_session_id and demo_items:
        background_tasks.add_task(
            name_demo_session,
            user_id=user_id,
            session_id=demo_session_id,
            demo_items=demo_items,
        )

    return WelcomeSessionResponse(
        welcome_session_id=welcome_session_id,
        demo_session_id=demo_session_id,
    )
