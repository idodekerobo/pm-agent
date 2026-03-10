"""
20260309202630_seed_user_agent_workspace_w_prod_templates.py — Force-write product-doc templates into existing user volumes.

Only writes /templates/* files (product-docs/ in the local templates dir).
Never touches /context/ or /memory/ — those contain real user data.

Usage:
    # All users:
    python scripts/20260309202630_seed_user_agent_workspace_w_prod_templates.py

    # Specific users:
    python scripts/20260309202630_seed_user_agent_workspace_w_prod_templates.py user-id-1 user-id-2
"""
import sys
import io
import asyncio
from pathlib import Path, PurePosixPath

# ── Make sure the app package is importable ──────────────────────────────────
BACKEND_SRC = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(BACKEND_SRC))

# Load .env.local before any Modal/app imports so token env vars are present.
# Modal reads MODAL_TOKEN_ID / MODAL_TOKEN_SECRET from the environment.
from dotenv import load_dotenv  # noqa: E402
ENV_FILE = Path(__file__).parent.parent / ".env.local"
load_dotenv(ENV_FILE)

from app.config import settings  # noqa: E402
from app.db.supabase_client import get_supabase  # noqa: E402


# ── Helpers ──────────────────────────────────────────────────────────────────

TEMPLATES_DIR = Path(__file__).parent.parent / "src" / "app" / "workspace" / "templates"


def _product_doc_files() -> list[tuple[Path, str]]:
    """Return (local_path, volume_dest) pairs for product-docs templates only."""
    product_docs = TEMPLATES_DIR / "product-docs"
    results = []
    for f in product_docs.rglob("*.md"):
        rel = f.relative_to(product_docs)
        dest = f"/templates/{rel.as_posix()}"
        results.append((f, dest))
    return results


def _fetch_all_user_ids(supabase) -> list[str]:
    """Query all distinct user_ids from the workspaces table."""
    result = supabase.table("workspaces").select("user_id").execute()
    ids = [row["user_id"] for row in result.data if row.get("user_id")]
    # deduplicate while preserving order
    seen = set()
    unique = []
    for uid in ids:
        if uid not in seen:
            seen.add(uid)
            unique.append(uid)
    return unique


async def reseed_user(user_id: str, files: list[tuple[Path, str]]) -> None:
    from app.workspace.modal_sandbox import get_or_create_volume

    vol = get_or_create_volume(user_id)

    def _do_write():
        with vol.batch_upload(force=True) as batch:
            for local_path, dest in files:
                batch.put_file(io.BytesIO(local_path.read_bytes()), dest)

    await asyncio.to_thread(_do_write)
    print(f"  [ok] {user_id} — wrote {len(files)} template(s)", flush=True)


async def main(user_ids: list[str]) -> None:
    files = _product_doc_files()
    if not files:
        print("No product-doc templates found — check TEMPLATES_DIR path.")
        sys.exit(1)

    print(f"Templates to write: {[dest for _, dest in files]}")
    print(f"Users to update:    {len(user_ids)}")
    print()

    failed = []
    for uid in user_ids:
        try:
            await reseed_user(uid, files)
        except Exception as e:
            print(f"  [FAIL] {uid}: {e}", flush=True)
            failed.append(uid)

    print()
    print(f"Done. {len(user_ids) - len(failed)}/{len(user_ids)} succeeded.")
    if failed:
        print(f"Failed user IDs: {failed}")
        sys.exit(1)


# ── Entrypoint ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # CLI args = explicit user IDs; no args = query all from DB
    if len(sys.argv) > 1:
        target_ids = sys.argv[1:]
        print(f"Using {len(target_ids)} user ID(s) from CLI args.")
    else:
        print("No user IDs passed — querying all users from DB...")
        supabase = get_supabase()
        target_ids = _fetch_all_user_ids(supabase)
        print(f"Found {len(target_ids)} user(s).")

    if not target_ids:
        print("No users found. Exiting.")
        sys.exit(0)

    print()
    asyncio.run(main(target_ids))
