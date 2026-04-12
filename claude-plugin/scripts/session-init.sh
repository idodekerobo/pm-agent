#!/bin/bash
# SessionStart hook — runs on every session start but does real work only once.
#
# First run:  copies workspace-template → $CLAUDE_PLUGIN_DATA
#             writes CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD + additionalDirectories
#             to ~/.claude/settings.json so the workspace CLAUDE.md loads from any directory
#
# Subsequent runs: all guards pass, exits in <10ms

set -euo pipefail

WORKSPACE="$CLAUDE_PLUGIN_DATA"
TEMPLATE="${CLAUDE_PLUGIN_ROOT}/workspace-template"
SETTINGS="$HOME/.claude/settings.json"

# ── 1. Bootstrap workspace ────────────────────────────────────────────────────

if [ ! -d "$WORKSPACE" ]; then
    echo "[Draft] Initializing workspace at $WORKSPACE..."
    mkdir -p "$WORKSPACE"
    cp -r "$TEMPLATE/." "$WORKSPACE/"
    echo "[Draft] Workspace ready. Run /draft:setup to load your PM brain."
fi

# ── 2. Configure ~/.claude/settings.json (one-time) ──────────────────────────
# Adds CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD and additionalDirectories
# so the workspace CLAUDE.md loads from any directory.

python3 - <<PYEOF
import json
from pathlib import Path

settings_path = Path("$SETTINGS")
workspace = "$WORKSPACE"

if settings_path.exists():
    try:
        settings = json.loads(settings_path.read_text())
    except Exception:
        settings = {}
else:
    settings = {}

changed = False

# Set env vars
env = settings.setdefault("env", {})
if env.get("DRAFT_WORKSPACE") != workspace:
    env["DRAFT_WORKSPACE"] = workspace
    changed = True
if env.get("CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD") != "1":
    env["CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD"] = "1"
    changed = True

# Set additionalDirectories
perms = settings.setdefault("permissions", {})
dirs = perms.setdefault("additionalDirectories", [])
if workspace not in dirs:
    dirs.append(workspace)
    changed = True

if changed:
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    print("[Draft] Settings updated — workspace context will load in every future session.")
PYEOF
