"""
RQ worker task for running a Claude Code agent against a user's GitHub repo.

Flow per task:
1. Clone the repo into a fresh Modal sandbox (no workspace volume)
2. Write the implementation spec as .agent-spec.md
3. Write .claude/settings.json with PostToolUse hooks that POST progress to the backend
4. Run `claude` CLI headlessly
5. Read .task-output.json written by claude for structured results
6. Push a feature branch and open a PR via gh CLI
7. Write progress updates to conversation_items (same session) throughout
8. If the session is Slack, post thread replies for each update
"""
import asyncio
import json
import modal

from app.config import settings
from app.db.supabase_client import get_supabase
from app.db.code_tasks import get_code_task, update_code_task
from app.db.conversations import append_conversation_item
from app.errors.logger import log_error_sync
from app.integrations.manager import get_valid_token
from app.workspace.modal_sandbox import get_agent_image, get_modal_app


# ---------------------------------------------------------------------------
# RQ entry point (must be synchronous)
# ---------------------------------------------------------------------------

def run_code_task(code_task_id: str) -> dict:
    return asyncio.run(_run(code_task_id))


# ---------------------------------------------------------------------------
# Core async logic
# ---------------------------------------------------------------------------

async def _run(code_task_id: str) -> dict:
    print(f"[code_task] starting — task_id={code_task_id}", flush=True)
    supabase = get_supabase()
    task = get_code_task(supabase, task_id=code_task_id)

    agent_session_id = str(task.agent_session_id)
    user_id = str(task.user_id)
    repo_url = task.repo_url
    base_branch = task.base_branch
    spec = task.spec

    session = (
        supabase.table("agent_sessions")
        .select("session_start_platform, external_thread_id")
        .eq("id", agent_session_id)
        .single()
        .execute()
    ).data

    sb = None
    try:
        anthropic_token = await get_valid_token(supabase, user_id=user_id, provider="claude-code")
        github_token = await get_valid_token(supabase, user_id=user_id, provider="github")

        env = {
            "NO_COLOR": "1",
            "GIT_TERMINAL_PROMPT": "0",
            "GH_TOKEN": github_token,
            "ANTHROPIC_API_KEY": anthropic_token,
        }

        app = await get_modal_app()
        sb = await modal.Sandbox.create.aio(
            image=get_agent_image(),
            timeout=60 * 90,  # 90 min max lifetime
            app=app,
        )

        # --- CLONE ---
        await _post_update(
            supabase, user_id=user_id, agent_session_id=agent_session_id,
            task_id=code_task_id, status="cloning",
            message="Cloning repository...", session=session,
        )
        update_code_task(supabase, task_id=code_task_id, status="cloning")

        clone_url = _inject_token_into_url(repo_url, github_token)
        result = await _exec(sb, f"git clone {clone_url} /repo", env=env, timeout_s=120)
        if result["exit_code"] != 0:
            raise RuntimeError(f"git clone failed:\n{result['stderr']}")

        await _exec(
            sb,
            'git config user.email "agent@pm-agent.app" && git config user.name "PM Agent"',
            workdir="/repo", env=env,
        )

        # Write spec (orchestrator's feature brief) and the full assembled prompt separately
        f = await sb.open.aio("/repo/.agent-spec.md", "w")
        async with f:
            await f.write.aio(spec)

        prompt_file = await sb.open.aio("/repo/.agent-prompt.md", "w")
        async with prompt_file:
            await prompt_file.write.aio(_build_claude_prompt(spec))

        # Write .claude/settings.json to configure PostToolUse hooks
        # Hooks POST back to our backend so updates appear in the chat thread
        hook_url = f"{settings.api_base_url}/webhook/claude-code/hook"
        hook_secret = settings.code_task_hook_secret
        claude_settings = {
            "hooks": {
                "PostToolUse": [
                    {
                        "matcher": "Write|Edit",
                        "hooks": [
                            {
                                "type": "command",
                                "command": (
                                    f"curl -s -X POST {hook_url} "
                                    f"-H 'Authorization: Bearer {hook_secret}' "
                                    f"-H 'Content-Type: application/json' "
                                    f"-d '{{\"task_id\": \"{code_task_id}\", \"tool\": \"Write\", \"tool_input\": \"Edited a file\"}}'"
                                ),
                            }
                        ],
                    }
                ]
            }
        }
        await _exec(sb, "mkdir -p /repo/.claude", env=env)
        settings_file = await sb.open.aio("/repo/.claude/settings.json", "w")
        async with settings_file:
            await settings_file.write.aio(json.dumps(claude_settings))

        # --- RUN ---
        await _post_update(
            supabase, user_id=user_id, agent_session_id=agent_session_id,
            task_id=code_task_id, status="running",
            message="Repo ready. Starting implementation — this may take a while...",
            session=session,
        )
        update_code_task(supabase, task_id=code_task_id, status="running")

        claude_result = await _exec(
            sb,
            'claude --dangerously-skip-permissions -p "$(cat .agent-prompt.md)"',
            workdir="/repo",
            env=env,
            timeout_s=60 * 60,  # 1 hour for the implementation step
        )
        if claude_result["stderr"]:
            print(f"[code_task] claude stderr: {claude_result['stderr'][:500]}", flush=True)

        # Read structured output written by claude per spec instructions
        output_result = await _exec(sb, "cat /repo/.task-output.json", env=env)
        task_output = {}
        if output_result["exit_code"] == 0:
            try:
                task_output = json.loads(output_result["stdout"])
            except json.JSONDecodeError:
                print("[code_task] WARNING: .task-output.json was not valid JSON", flush=True)
        else:
            print("[code_task] WARNING: .task-output.json not found", flush=True)

        final_text = task_output.get("summary", "")

        # --- PUSH ---
        branch_name = task_output.get("branch") or f"pm-agent/{code_task_id[:8]}"
        print(f"[code_task] pushing branch={branch_name}...", flush=True)
        await _post_update(
            supabase, user_id=user_id, agent_session_id=agent_session_id,
            task_id=code_task_id, status="pushing",
            message=f"Implementation complete. Pushing branch `{branch_name}`...",
            session=session,
        )
        update_code_task(supabase, task_id=code_task_id, status="pushing", output_branch=branch_name)

        push_cmds = " && ".join([
            f"git checkout -b {branch_name}",
            "git add -A",
            "git diff --cached --quiet || git commit -m 'feat: PM agent implementation (cleanup)'",
            f"git push origin {branch_name}",
        ])
        push_result = await _exec(sb, push_cmds, workdir="/repo", env=env, timeout_s=120)
        if push_result["exit_code"] != 0:
            print(f"[code_task] push stderr: {push_result['stderr']}", flush=True)
            raise RuntimeError(f"git push failed:\n{push_result['stderr']}")

        # Open PR
        repo_path = _parse_repo_path(repo_url)
        pr_title = (spec.splitlines()[0][:72] if spec else "PM Agent: implement feature").strip("#").strip()
        print(f"[code_task] creating PR — repo={repo_path} title={pr_title!r}", flush=True)
        pr_result = await _exec(
            sb,
            f'gh pr create --repo {repo_path} --base {base_branch} --head {branch_name} '
            f'--title "{pr_title}" --body "$(cat .agent-spec.md)"',
            workdir="/repo",
            env=env,
            timeout_s=30,
        )
        pr_url = pr_result["stdout"].strip() if pr_result["exit_code"] == 0 else None
        if pr_result["exit_code"] != 0:
            print(f"[code_task] PR stderr: {pr_result['stderr']}", flush=True)

        # --- COMPLETE ---
        complete_msg = f"Done! Branch `{branch_name}` pushed."
        if pr_url:
            complete_msg += f"\n\nPR ready for review: {pr_url}"
        if final_text:
            complete_msg += f"\n\n**Agent summary:**\n{final_text}"

        print(f"[code_task] complete — task_id={code_task_id}", flush=True)
        update_code_task(supabase, task_id=code_task_id, status="complete", pr_url=pr_url)
        await _post_update(
            supabase, user_id=user_id, agent_session_id=agent_session_id,
            task_id=code_task_id, status="complete",
            message=complete_msg, session=session,
        )
        return {
            "status": "complete",
            "task_id": code_task_id,
            "branch": branch_name,
            "pr_url": pr_url,
            "summary": final_text,
            "output": output_result,
        }

    except Exception as e:
        error_msg = str(e)
        print(f"[code_task] FAILED — task_id={code_task_id} error={error_msg}", flush=True)
        log_error_sync(user_id, "worker", e, context={
            "origin": "code_task_worker",
            "code_task_id": code_task_id,
        })
        update_code_task(supabase, task_id=code_task_id, status="failed", error_message=error_msg)
        await _post_update(
            supabase, user_id=user_id, agent_session_id=agent_session_id,
            task_id=code_task_id, status="failed",
            message=f"Task failed: {error_msg[:500]}",
            session=session,
        )
        raise

    finally:
        if sb:
            try:
                await sb.terminate.aio()
            except Exception:
                pass


# ---------------------------------------------------------------------------
# Prompt assembly
# ---------------------------------------------------------------------------

def _build_claude_prompt(spec: str) -> str:
    """Wrap the orchestrator's feature spec with standard engineering instructions.

    The spec covers WHAT to build. This function adds HOW to work (git workflow,
    exploration approach, output requirement). Keeping these separate means the
    orchestrator stays focused on product requirements, not engineering process.
    """
    return f"""You are an expert software engineer implementing a feature in a real production codebase.

## How to work

- **Explore before writing.** Read the relevant files and understand the existing patterns, conventions, and architecture before making any changes.
- **Use git as version control throughout.** Commit at logical checkpoints as you work — don't wait until the end. Use clear, descriptive commit messages:
  ```
  git add -A && git commit -m "description of what this commit does"
  ```
- **Do not push, create branches, or open PRs.** That is handled automatically after you finish.
- **Do not start servers or long-running processes.**
- **When you hit ambiguity**, make a reasonable engineering decision and note it in your final summary. Do not stop to ask.

---

## Feature spec

{spec}

---

## When you are done

Write this file before stopping:

**File:** `.task-output.json`
**Content:**
```json
{{"summary": "2–3 sentences describing what was implemented and any notable decisions or tradeoffs made."}}
```

Do not consider the task complete until `.task-output.json` exists.
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _exec(
    sb: modal.Sandbox,
    command: str,
    workdir: str = "/",
    env: dict | None = None,
    timeout_s: int = 60,
) -> dict:
    full_env = {"NO_COLOR": "1", "GIT_TERMINAL_PROMPT": "0"}
    if env:
        full_env.update(env)
    p = await sb.exec.aio("bash", "-c", command, workdir=workdir, timeout=timeout_s, env=full_env)
    stdout = await p.stdout.read.aio()
    stderr = await p.stderr.read.aio()
    await p.wait.aio()
    return {"stdout": stdout, "stderr": stderr, "exit_code": p.returncode}


async def _post_update(
    supabase,
    *,
    user_id: str,
    agent_session_id: str,
    task_id: str,
    status: str,
    message: str,
    session: dict | None = None,
) -> None:
    """Write a progress message to conversation_items and optionally post to Slack."""
    item = {
        "role": "assistant",
        "type": "code_task_update",
        "content": [{"type": "output_text", "text": message}],
        "code_task_id": task_id,
        "code_task_status": status,
    }
    append_conversation_item(supabase, agent_session_id=agent_session_id, item=item)

    if session and session.get("session_start_platform") == "slack":
        external_thread_id = session.get("external_thread_id", "")
        if external_thread_id:
            await _post_slack_update(supabase, user_id=user_id,
                                     external_thread_id=external_thread_id, message=message)


async def _post_slack_update(
    supabase,
    *,
    user_id: str,
    external_thread_id: str,
    message: str,
) -> None:
    """Best-effort Slack thread reply for code task progress."""
    try:
        from app.messaging.slack.client import post_message
        from app.integrations.crypto import decrypt_token

        result = (
            supabase.table("slack_installations")
            .select("bot_token")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return

        bot_token = decrypt_token(result.data[0]["bot_token"])

        # Mentions: "{channel}:{thread_ts}" — DMs: "dm:{channel}"
        if external_thread_id.startswith("dm:"):
            channel = external_thread_id[3:]
            thread_ts = None
        else:
            channel, thread_ts = external_thread_id.split(":", 1)

        await post_message(bot_token, channel, message, thread_ts=thread_ts)
    except Exception as e:
        print(f"[code_task] slack update failed (non-fatal): {e}", flush=True)


def _inject_token_into_url(repo_url: str, token: str) -> str:
    """Convert https://github.com/owner/repo to https://x-access-token:{token}@github.com/owner/repo"""
    return repo_url.replace("https://", f"https://x-access-token:{token}@")


def _parse_repo_path(repo_url: str) -> str:
    """Extract 'owner/repo' from a GitHub URL."""
    path = repo_url.rstrip("/").removesuffix(".git")
    return "/".join(path.split("/")[-2:])


