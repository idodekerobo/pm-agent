"""
20260316191217_run_synthesis_for_users — Manually trigger the passive monitoring
synthesis job for one or more users.

Reads event logs from each user's Modal Volume, calls the learning agent to
update monitored_updates.md, and advances last_synthesized_at on the integrations
table. Useful for testing synthesis end-to-end before the 6-hour cron fires, or
for backfilling a user who was added after the last cron run.

Usage:
    # Specific users (most common — use your own user ID to test):
    .venv/bin/python3 scripts/20260316191217_run_synthesis_for_users.py <user-id>
    .venv/bin/python3 scripts/20260316191217_run_synthesis_for_users.py user-id-1 user-id-2

    # All users with active monitoring integrations:
    .venv/bin/python3 scripts/20260316191217_run_synthesis_for_users.py

Run from the backend/ directory:
    cd backend
    .venv/bin/python3 scripts/20260316191217_run_synthesis_for_users.py <user-id>
"""
import sys
import asyncio
from pathlib import Path

# ── Make sure the app package is importable ──────────────────────────────────
BACKEND_SRC = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(BACKEND_SRC))

# Load .env.local before any Modal/app imports so token env vars are present.
from dotenv import load_dotenv  # noqa: E402
ENV_FILE = Path(__file__).parent.parent / ".env.local"
load_dotenv(ENV_FILE)

from app.db.supabase_client import get_supabase  # noqa: E402


# ── Helpers ──────────────────────────────────────────────────────────────────

def _fetch_active_user_ids(supabase) -> list[str]:
    """Return distinct user IDs that have at least one monitored integration."""
    result = (
        supabase.table("integrations")
        .select("user_id")
        .eq("monitoring_enabled", True)
        .in_("provider", ["slack", "github", "linear"])
        .execute()
    )
    seen = set()
    unique = []
    for row in result.data or []:
        uid = row.get("user_id")
        if uid and uid not in seen:
            seen.add(uid)
            unique.append(uid)
    return unique


async def main(user_ids: list[str]) -> None:
    from app.workers.synthesis_tasks import synthesize_monitored_updates

    print(f"Running synthesis for {len(user_ids)} user(s)...\n")

    failed = []
    for uid in user_ids:
        print(f"[synthesis] → {uid}")
        try:
            # synthesize_monitored_updates is a sync RQ task — run it directly
            await asyncio.to_thread(synthesize_monitored_updates, uid)
            print(f"  [ok] {uid}\n")
        except Exception as e:
            print(f"  [FAIL] {uid}: {e}\n")
            failed.append(uid)

    print(f"Done. {len(user_ids) - len(failed)}/{len(user_ids)} succeeded.")
    if failed:
        print(f"Failed user IDs: {failed}")
        sys.exit(1)


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_ids = sys.argv[1:]
        print(f"Using {len(target_ids)} user ID(s) from CLI args.")
    else:
        print("No user IDs passed — querying all users with active monitoring integrations...")
        supabase = get_supabase()
        target_ids = _fetch_active_user_ids(supabase)
        print(f"Found {len(target_ids)} user(s).")

    if not target_ids:
        print("No users found. Exiting.")
        sys.exit(0)

    print()
    asyncio.run(main(target_ids))
