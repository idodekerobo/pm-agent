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

Rules:
- Do NOT say "Welcome", "Hello", or introduce yourself. Start with something grounded and specific.
- Open by referencing their product or company concretely — one sentence that shows Draft already
  knows their context.
- In 2-3 sentences, explain what makes Draft different from a generic AI assistant:
  * Draft builds persistent memory across sessions — it learns your product, team, and decisions
    and gets more useful the more you use it.
  * It connects to the tools you already use: Slack, Linear, Google Drive, Notion, GitHub, and more.
  * It can write PRDs, decision docs, competitive research, and create issues — not just chat.
  * If they have issues they can directly email the founder unlike other huge companies ;)
- Tell them they can customize how their agent works: their Agent Files (in Settings → Agent Files)
  include document templates and skills they can edit or expand — adding new templates, new
  integrations, or custom instructions shapes how Draft works for their specific team.
- If they had a prior demo conversation, mention it's saved in their sidebar so they can pick it up.
- End with ONE sharp, specific question based on their stated use cases — something actionable,
  not generic. Make it feel like the natural next step.
- Keep it under 220 words.
- Do not use any tools — you have all the context you need in this message.
"""


# ---------------------------------------------------------------------------
# Request / Response
# ---------------------------------------------------------------------------

class ProfileData(BaseModel):
    full_name: str = ""
    role: str = ""
    company_name: str = ""
    company_url: str = ""
    product_name: str = ""
    product_description: str = ""
    use_cases: list[str] = []
    use_case_context: str = ""


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
    if p.company_name:
        parts.append(f"Company: {p.company_name}")
    if p.company_url:
        parts.append(f"Company URL: {p.company_url}")
    if p.product_name:
        parts.append(f"Product: {p.product_name}")
    if p.product_description:
        parts.append(f"Product description: {p.product_description}")
    if p.use_cases:
        parts.append(f"Intended use cases: {', '.join(p.use_cases)}")
    if p.use_case_context:
        parts.append(f"Additional context: {p.use_case_context}")
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
