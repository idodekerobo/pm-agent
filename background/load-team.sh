#!/bin/bash
# load-team.sh — Standalone load-team script for SessionStart hook
#
# Standalone equivalent of the /draft:load-team plugin skill.
# Pulls the latest team context from the shared GitHub repo into the
# local workspace before each Claude Code session starts.
#
# Called from the SessionStart hook in hooks.json — must:
#   - Always exit 0 (a failure here must NEVER block Claude from starting)
#   - Complete within 30 seconds (hook is called with timeout wrapper)
#   - Be a no-op if collaboration is not configured
#
# Uses the separate-clone pattern: clone → copy → delete temp.
# The Draft workspace is NEVER initialized as a git repo.

set -uo pipefail

DRAFT_GLOBAL="$HOME/.draft"

# ── Resolve active profile ─────────────────────────────────────────────────────
ACTIVE_PROFILE="default"
_profile_file="$DRAFT_GLOBAL/active-profile"
if [ -f "$_profile_file" ]; then
    _p=$(tr -d '[:space:]' < "$_profile_file")
    [ -n "$_p" ] && ACTIVE_PROFILE="$_p"
fi

WORKSPACE="$DRAFT_GLOBAL/workspaces/$ACTIVE_PROFILE"
COLLAB_CONFIG="$WORKSPACE/config/collaboration.json"
LOCAL_CONFIG="$WORKSPACE/config/local.json"

# ── No-op checks ───────────────────────────────────────────────────────────────
# Silently skip if collaboration is not configured. Not an error.
if [ ! -f "$COLLAB_CONFIG" ]; then
    exit 0
fi

MODE=$(python3 -c "
import json
d = json.load(open('$COLLAB_CONFIG'))
print(d.get('mode', ''))
" 2>/dev/null || echo "")

if [ "$MODE" != "github" ]; then
    exit 0
fi

TEAM_REPO_URL=$(python3 -c "
import json
print(json.load(open('$COLLAB_CONFIG')).get('team_repo_url', ''))
" 2>/dev/null || echo "")

if [ -z "$TEAM_REPO_URL" ]; then
    exit 0
fi

# ── Check gh auth ──────────────────────────────────────────────────────────────
if ! command -v gh &>/dev/null; then
    exit 0
fi

if ! gh auth status &>/dev/null 2>&1; then
    exit 0
fi

# ── Separate-clone pattern ─────────────────────────────────────────────────────
TEAM_REPO_SUBDIR=$(python3 -c "
import json
print(json.load(open('$COLLAB_CONFIG')).get('team_repo_subdir', 'root'))
" 2>/dev/null || echo "root")

TMPDIR=$(mktemp -d /tmp/draft-load-XXXXXX)
_cleanup() { rm -rf "$TMPDIR"; }
trap _cleanup EXIT

# Clone (shallow, no history needed — just the latest state)
git clone --depth 1 "$TEAM_REPO_URL" "$TMPDIR" --quiet 2>/dev/null || exit 0

# Resolve subdir
if [ "$TEAM_REPO_SUBDIR" = "root" ]; then
    SOURCE_PATH="$TMPDIR"
else
    SOURCE_PATH="$TMPDIR/$TEAM_REPO_SUBDIR"
fi

# Validate source has context/
if [ ! -d "$SOURCE_PATH/context" ]; then
    exit 0
fi

# ── Read last_loaded for change detection ──────────────────────────────────────
LAST_LOADED=""
if [ -f "$LOCAL_CONFIG" ]; then
    LAST_LOADED=$(python3 -c "
import json
print(json.load(open('$LOCAL_CONFIG')).get('last_loaded', ''))
" 2>/dev/null || echo "")
fi

# ── Copy context files ─────────────────────────────────────────────────────────
mkdir -p "$WORKSPACE/context"
cp -r "$SOURCE_PATH/context/." "$WORKSPACE/context/"

# Copy collaboration.json if present (keeps teammates list in sync)
if [ -f "$SOURCE_PATH/config/collaboration.json" ]; then
    mkdir -p "$WORKSPACE/config"
    cp "$SOURCE_PATH/config/collaboration.json" "$WORKSPACE/config/collaboration.json"
fi

# ── Update last_loaded timestamp ───────────────────────────────────────────────
NEW_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

python3 - <<PYEOF
import json, os

config_path = '$LOCAL_CONFIG'
if os.path.exists(config_path):
    try:
        d = json.load(open(config_path))
    except Exception:
        d = {}
else:
    d = {}

d['last_loaded'] = '$NEW_TS'

os.makedirs(os.path.dirname(config_path), exist_ok=True)
with open(config_path, 'w') as f:
    json.dump(d, f, indent=2)
PYEOF

exit 0
