"""
Context gathering tasks for provider integrations.
These functions are enqueued after successful OAuth callbacks.

RQ jobs must be synchronous functions. The worker task handles:
1. Fetching user organization
2. Creating/fetching project and agent session
3. Getting workspace and sandbox context
4. Calling the agent function with all context
5. Saving results to Supabase
"""
import asyncio
from datetime import datetime, timezone
from agents import RunResult
from app.db.supabase_client import get_supabase
from app.agents.context import build_agent_run_payload
from app.agents.researcher_agent import (
    run_research_and_learn,
    GDRIVE_CONTEXT_PROMPT,
    LINEAR_CONTEXT_PROMPT,
)


def _record_context_task_usage(supabase, user_id: str, payload, result: RunResult) -> None:
    """
    Best-effort model usage recording for background context gathering tasks.
    No credit deduction (these are free system runs) so ledger_id is always None.
    """
    try:
        from app.billing import get_billing_account_and_balance, record_model_usage
        billing_account, _ = get_billing_account_and_balance(supabase, user_id=user_id)
        if not billing_account:
            return
        usage = result.context_wrapper.usage
        record_model_usage(
            supabase,
            billing_account=billing_account,
            agent_session_id=payload.agent_session_id,
            organization_id=payload.organization_id,
            usage_data={
                "provider": "openai",
                "model": "gpt-5.2",
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "cached_input_tokens": (
                    usage.input_tokens_details.cached_tokens
                    if usage.input_tokens_details else 0
                ),
                "reasoning_tokens": (
                    usage.output_tokens_details.reasoning_tokens
                    if usage.output_tokens_details else 0
                ),
            },
            ledger_id=None,
        )
    except Exception as e:
        print(f"[billing] failed to record context task usage: {e}", flush=True)


def gather_google_drive_context(user_id: str, provider: str = "google"):
    """
    Enqueued after Google Drive OAuth callback.
    Fetches user context, creates agent session, and runs context gathering agent.

    Args:
        user_id: User who connected the integration
        provider: Integration provider name
    """
    import sys
    import urllib.request
    from httpx._utils import get_environment_proxies
    print("=" * 80, flush=True)
    print("STARTING GOOGLE DRIVE CONTEXT GATHERING TASK", flush=True)
    print(f"User ID: {user_id}", flush=True)
    print("WORKER ENV - getproxies:", urllib.request.getproxies(), flush=True)
    print("WORKER ENV - httpx proxies:", get_environment_proxies(), flush=True)
    print("=" * 80, flush=True)
    sys.stdout.flush()

    async def _run():
        supabase = get_supabase()
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")

        result = await run_research_and_learn(payload, GDRIVE_CONTEXT_PROMPT)
        _record_context_task_usage(supabase, user_id, payload, result)

        # TODO: save session tool calls and result

        return {
            "status": "success",
            "user_id": user_id,
            "provider": provider,
            "context_gathered_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error gathering Google Drive context for user {user_id}: {str(e)}")
        raise


def gather_linear_context(user_id: str, provider: str = "linear"):
    """
    Enqueued after Linear OAuth callback.
    Fetches user context, creates agent session, and runs context gathering agent.

    Args:
        user_id: User who connected the integration
        provider: Integration provider name
    """
    import sys
    import urllib.request
    from httpx._utils import get_environment_proxies
    print("=" * 80, flush=True)
    print("STARTING LINEAR CONTEXT GATHERING TASK", flush=True)
    print(f"User ID: {user_id}", flush=True)
    print("WORKER ENV - getproxies:", urllib.request.getproxies(), flush=True)
    print("WORKER ENV - httpx proxies:", get_environment_proxies(), flush=True)
    print("=" * 80, flush=True)
    sys.stdout.flush()

    async def _run():
        supabase = get_supabase()
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")

        result = await run_research_and_learn(payload, LINEAR_CONTEXT_PROMPT)
        _record_context_task_usage(supabase, user_id, payload, result)

        # TODO: save session tool calls and result

        return {
            "status": "success",
            "user_id": user_id,
            "provider": provider,
            "context_gathered_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error gathering Linear context for user {user_id}: {str(e)}")
        raise

def handle_slack_message(event_payload: dict, installation_id: str):
    """
    Process an incoming Slack event (app_mention or DM) and post a reply.

    Enqueued by POST /slack/events immediately after the 200 ACK so Slack's
    3-second response window is never at risk.

    Args:
        event_payload: The full Slack Events API payload dict.
        installation_id: UUID of the slack_installations row for this workspace.
    """
    import sys
    event_type = event_payload.get("event", {}).get("type")
    print("=" * 80, flush=True)
    print("\n")
    print("SLACK EVENT — handle_slack_message", flush=True)
    print(f"installation_id: {installation_id}", flush=True)
    print(f"event type: {event_type}", flush=True)
    print("event payload:")
    print(event_payload)
    print("\n")
    print("=" * 80, flush=True)
    sys.stdout.flush()

    async def _run():
        from app.messaging.slack import get_installation_by_id, dispatch_event

        installation = get_installation_by_id(installation_id)
        if not installation:
            print(f"[slack] installation {installation_id} not found — skipping", flush=True)
            return

        await dispatch_event(event_payload, installation)

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"[slack] error in handle_slack_message: {e}", flush=True)
        raise


def provision_skill(user_id: str, provider: str):
    """Write skill files for the given provider into the user's workspace volume.

    Enqueued after a successful OAuth callback so the agent has skill docs
    available on its next run without needing to provision them each time.
    """
    async def _run():
        from app.agents.context import resolve_workspace_context, provision_skills_for_provider
        supabase = get_supabase()
        organization_id, _project_id, workspace_id, _sandbox_id, _profile = resolve_workspace_context(supabase, user_id)
        await provision_skills_for_provider(
            workspace_id=workspace_id,
            organization_id=organization_id,
            user_id=user_id,
            provider=provider,
        )

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error provisioning skill for provider={provider} user={user_id}: {e}")
        raise


def deprovision_skill(user_id: str, provider: str):
    """Remove skill files for the given provider from the user's workspace volume.

    Enqueued when the user disconnects an integration.
    """
    async def _run():
        from app.agents.context import resolve_workspace_context, deprovision_skills_for_provider
        supabase = get_supabase()
        organization_id, _project_id, workspace_id, _sandbox_id, _profile = resolve_workspace_context(supabase, user_id)
        await deprovision_skills_for_provider(
            workspace_id=workspace_id,
            organization_id=organization_id,
            user_id=user_id,
            provider=provider,
        )

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error deprovisioning skill for provider={provider} user={user_id}: {e}")
        raise


def seed_workspace(user_id: str):
    """Write template context and memory files into the user's workspace if they don't exist yet.

    Enqueued after profile creation so the agent always has a set of context files
    to work with, even before any context-gathering tasks have run.

    Defensive: skips any file that already exists in the volume, so it is safe to
    run concurrently with gather_onboarding_context or any other task.
    """
    async def _run():
        from app.agents.context import resolve_workspace_context
        from app.config import settings
        from pathlib import Path

        supabase = get_supabase()
        organization_id, _project_id, workspace_id, _sandbox_id, _profile = resolve_workspace_context(supabase, user_id)

        templates_dir = Path(__file__).parent.parent / "workspace" / "templates"
        template_files = list(templates_dir.rglob("*.md"))

        def _volume_dest(f: Path) -> str:
            """Map a local template source file to its destination path in the agent volume.

            context/ and memory/ are written at the volume root (e.g. /context/company.md).
            product-docs/ is flattened into /templates/ (e.g. /templates/prd.md),
            dropping the product-docs/ prefix so templates sit alongside /context/ and /memory/.
            """
            rel = f.relative_to(templates_dir)
            first = rel.parts[0] if rel.parts else ""
            if first == "product-docs":
                filename = Path(*rel.parts[1:]).as_posix() if len(rel.parts) > 1 else rel.name
                return f"/templates/{filename}"
            return f"/{rel.as_posix()}"

        if settings.workspace_backend == "production":
            import io
            from pathlib import PurePosixPath
            from app.workspace.modal_sandbox import get_or_create_volume

            vol = get_or_create_volume(user_id)

            # Collect paths already in the volume so we only write what's missing
            existing = set()
            for check_dir in ("/context", "/memory", "/templates"):
                try:
                    entries = await vol.listdir.aio(check_dir)
                    for entry in (entries or []):
                        existing.add(PurePosixPath(entry.path).as_posix())
                except Exception:
                    pass  # directory doesn't exist yet — all files in it are missing

            missing = [
                f for f in template_files
                if _volume_dest(f) not in existing
            ]

            if missing:
                def _do_seed():
                    with vol.batch_upload(force=True) as batch:
                        for f in missing:
                            batch.put_file(io.BytesIO(f.read_bytes()), _volume_dest(f))

                await asyncio.to_thread(_do_seed)
                print(f"[seed_workspace] wrote {len(missing)} template files for user {user_id}", flush=True)
            else:
                print(f"[seed_workspace] all template files already exist for user {user_id} — skipping", flush=True)

        else:
            from app.workspace.local_workspace_runtime import ensure_workspace, seed_workspace_if_empty
            root = ensure_workspace(workspace_id, organization_id)
            seed_workspace_if_empty(root)

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"[seed_workspace] error for user {user_id}: {e}")
        raise


def gather_onboarding_context(user_id: str, profile: dict):
    """
    Enqueued after onboarding profile submission.
    Seeds the agent's context files with the user-provided profile data directly,
    bypassing the researcher since we already have the information.
    """
    async def _run():
        from app.agents.learning_agent import run_learning_agent

        supabase = get_supabase()
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")

        full_name = profile.get("full_name") or "Not provided"
        role = profile.get("role") or "Not provided"
        company_url = profile.get("company_url") or "Not provided"
        scrape_observations = profile.get("onboarding_scrape_observations") or "Not provided"
        scrape_correction = profile.get("onboarding_scrape_correction")
        current_focus_raw = profile.get("current_focus") or []
        current_focus = ", ".join(current_focus_raw) if current_focus_raw else "Not provided"
        daily_activities = profile.get("daily_activities") or []
        daily_activities_str = ", ".join(daily_activities) if daily_activities else "Not provided"

        product_context = f"Agent observations about their product/company:\n{scrape_observations}"
        if scrape_correction:
            product_context += (
                f"\n\nThe user corrected the above observations with this clarification "
                f"(treat as authoritative where it conflicts):\n{scrape_correction}"
            )

        prompt = f"""Write the following user-provided onboarding information to the appropriate workspace context files.
This information was gathered during onboarding — treat it as authoritative.

Full name: {full_name}
Role: {role}
Company URL: {company_url}
Current focus: {current_focus}
Daily activities: {daily_activities_str}

{product_context}

Write to:
- context/user.md — full name, role, current focus, and daily activities
- context/company.md — company URL and anything inferable about the company from the product observations
- context/product.md — synthesized product description derived from the observations (and correction if present)

Ensure each file has valid YAML frontmatter (name, description using > block scalar, last_updated).
Read each file before writing so you merge rather than overwrite any existing content."""

        await run_learning_agent(payload, prompt)

        return {
            "status": "success",
            "user_id": user_id,
        }

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error gathering onboarding context for user {user_id}: {str(e)}")
        raise


def gather_github_context(user_id: str, provider: str = "github"):
    """
    Enqueued after GitHub OAuth callback.
    Fetches user context, creates agent session, and runs context gathering agent.
    """
    async def _run():
        from app.agents.researcher_agent import run_research_and_learn, GITHUB_CONTEXT_PROMPT
        supabase = get_supabase()
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")
        result = await run_research_and_learn(payload, GITHUB_CONTEXT_PROMPT)
        _record_context_task_usage(supabase, user_id, payload, result)
        return {
            "status": "success",
            "user_id": user_id,
            "provider": provider,
            "context_gathered_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error gathering GitHub context for user {user_id}: {str(e)}")
        raise


def gather_notion_context(user_id: str, provider: str = "notion"):
    """
    Enqueued after Notion OAuth callback.
    Fetches user context, creates agent session, and runs context gathering agent.
    """
    async def _run():
        from app.agents.researcher_agent import run_research_and_learn, NOTION_CONTEXT_PROMPT
        supabase = get_supabase()
        payload = build_agent_run_payload(supabase, user_id, session_start_platform="background")
        result = await run_research_and_learn(payload, NOTION_CONTEXT_PROMPT)
        _record_context_task_usage(supabase, user_id, payload, result)
        return {
            "status": "success",
            "user_id": user_id,
            "provider": provider,
            "context_gathered_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        return asyncio.run(_run())
    except Exception as e:
        print(f"Error gathering Notion context for user {user_id}: {str(e)}")
        raise
