#!/bin/bash
# install.sh — Draft daemon installer (idempotent)
#
# Sets up ~/.draft/background/ and registers a macOS LaunchAgent.
# Safe to re-run: unloads existing daemon before reloading (no duplicates).
#
# Usage:
#   bash ~/.draft/background/install.sh
#   bash "${CLAUDE_PLUGIN_ROOT}/background/install.sh"

set -euo pipefail

DRAFT_GLOBAL="$HOME/.draft"
DRAFT_BACKGROUND="$DRAFT_GLOBAL/background"
PLIST_LABEL="com.draft.daemon"
PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[Draft Daemon] Installing..."
echo "[Draft Daemon] Source: $SCRIPT_DIR"
echo "[Draft Daemon] Target: $DRAFT_BACKGROUND"
echo ""

# ── 1. Create directory structure ──────────────────────────────────────────────
mkdir -p \
    "$DRAFT_BACKGROUND" \
    "$DRAFT_BACKGROUND/pending" \
    "$DRAFT_BACKGROUND/failed" \
    "$DRAFT_BACKGROUND/logs" \
    "$DRAFT_BACKGROUND/state"
echo "[Draft Daemon] Created directory structure at $DRAFT_BACKGROUND"

# Seed state files if not already present (preserve existing state across reinstalls)
if [ ! -f "$DRAFT_BACKGROUND/state/granola.json" ]; then
    printf '{"last_checked_at":null,"processed_meeting_ids":[]}\n' \
        > "$DRAFT_BACKGROUND/state/granola.json"
    echo "[Draft Daemon] Seeded state/granola.json"
fi

# ── 2. Copy scripts ────────────────────────────────────────────────────────────
_SCRIPTS=(
    "draft-daemon.sh"
    "on-session-end.sh"
    "config.sh"
    "status.sh"
    "start.sh"
    "stop.sh"
    "uninstall.sh"
    "synthesize.sh"
    "commit-to-team-context.sh"
    "load-team.sh"
)

_MISSING=()
for script in "${_SCRIPTS[@]}"; do
    if [ -f "$SCRIPT_DIR/$script" ]; then
        cp "$SCRIPT_DIR/$script" "$DRAFT_BACKGROUND/$script"
        chmod +x "$DRAFT_BACKGROUND/$script"
    else
        _MISSING+=("$script")
        echo "[Draft Daemon] WARNING: $script not found in $SCRIPT_DIR" >&2
    fi
done

if [ ${#_MISSING[@]} -eq 0 ]; then
    echo "[Draft Daemon] Scripts installed to $DRAFT_BACKGROUND"
else
    echo "[Draft Daemon] WARNING: ${#_MISSING[@]} script(s) missing — daemon may not function correctly" >&2
fi

# ── 2b. Copy synthesizers/ and intelligence/ subdirectories ────────────────────
for subdir in "synthesizers" "intelligence"; do
    if [ -d "$SCRIPT_DIR/$subdir" ]; then
        mkdir -p "$DRAFT_BACKGROUND/$subdir"
        for script in "$SCRIPT_DIR/$subdir"/*.sh; do
            [ -f "$script" ] || continue
            dest="$DRAFT_BACKGROUND/$subdir/$(basename "$script")"
            cp "$script" "$dest"
            chmod +x "$dest"
        done
        # Copy README if present
        [ -f "$SCRIPT_DIR/$subdir/README.md" ] && cp "$SCRIPT_DIR/$subdir/README.md" "$DRAFT_BACKGROUND/$subdir/README.md"
        echo "[Draft Daemon] Installed $subdir/ to $DRAFT_BACKGROUND/$subdir"
    else
        echo "[Draft Daemon] NOTE: $subdir/ not found in $SCRIPT_DIR — synthesis adapters not installed" >&2
    fi
done

# ── 2c. Copy integrations/ subdirectories ─────────────────────────────────────
# Each integration (granola, slack, ...) has its own subdir with shell + TS code.
for integ_src in "$SCRIPT_DIR/integrations"/*/; do
    [ -d "$integ_src" ] || continue
    integ_name=$(basename "$integ_src")
    integ_dst="$DRAFT_BACKGROUND/integrations/$integ_name"
    mkdir -p "$integ_dst"
    # Copy shell scripts
    for script in "$integ_src"*.sh; do
        [ -f "$script" ] || continue
        cp "$script" "$integ_dst/$(basename "$script")"
        chmod +x "$integ_dst/$(basename "$script")"
    done
    echo "[Draft Daemon] Installed integrations/$integ_name/ to $integ_dst"
done

# ── 3. Dependency checks ───────────────────────────────────────────────────────
echo ""
echo "[Draft Daemon] Checking dependencies..."
_DEPS_OK=true

if command -v claude &>/dev/null; then
    echo "[Draft Daemon]   claude ... ok"
else
    echo "[Draft Daemon]   claude ... NOT FOUND — synthesis will be disabled until installed" >&2
    _DEPS_OK=false
fi

if command -v tmux &>/dev/null; then
    echo "[Draft Daemon]   tmux   ... ok"
else
    echo "[Draft Daemon]   tmux   ... NOT FOUND — claude-code adapter unavailable" >&2
    _DEPS_OK=false
fi

if command -v python3 &>/dev/null; then
    echo "[Draft Daemon]   python3 .. ok"
else
    echo "[Draft Daemon]   python3 .. NOT FOUND — daemon requires python3 for JSON parsing" >&2
    _DEPS_OK=false
fi

if [ "$_DEPS_OK" = true ]; then
    echo "[Draft Daemon] All dependencies satisfied"
fi

# ── 4. Write LaunchAgent plist ─────────────────────────────────────────────────
# plist uses absolute paths (no shell variable expansion at plist read time).
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${PLIST_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>${DRAFT_BACKGROUND}/draft-daemon.sh</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${DRAFT_BACKGROUND}/logs/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>${DRAFT_BACKGROUND}/logs/daemon-error.log</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
PLIST

echo ""
echo "[Draft Daemon] LaunchAgent plist written to $PLIST_PATH"

# ── 5. Load the LaunchAgent ────────────────────────────────────────────────────
# Unload first if already running (idempotent).
if launchctl list "$PLIST_LABEL" &>/dev/null 2>&1; then
    echo "[Draft Daemon] Stopping existing daemon instance..."
    launchctl unload "$PLIST_PATH" 2>/dev/null || true
    sleep 1
fi

launchctl load "$PLIST_PATH"
echo "[Draft Daemon] LaunchAgent loaded"

# ── 6. Verify ─────────────────────────────────────────────────────────────────
sleep 2
echo ""
if launchctl list "$PLIST_LABEL" &>/dev/null 2>&1; then
    echo "[Draft Daemon] Installation complete — daemon is running"
    echo ""
    echo "  Check status:   bash ~/.draft/background/status.sh"
    echo "  View logs:      tail -f ~/.draft/background/logs/daemon.log"
    echo "  Stop:           bash ~/.draft/background/stop.sh"
    echo "  Start:          bash ~/.draft/background/start.sh"
    echo "  Uninstall:      bash ~/.draft/background/uninstall.sh"
else
    echo "[Draft Daemon] WARNING: daemon may not have started cleanly" >&2
    echo "  Check logs at: $DRAFT_BACKGROUND/logs/daemon-error.log" >&2
    echo "  Try running manually to debug: bash $DRAFT_BACKGROUND/draft-daemon.sh" >&2
    exit 1
fi
