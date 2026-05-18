#!/bin/bash
# draft-daemon.sh — Draft background daemon
#
# Runs as a LaunchAgent (always-on, auto-restart via KeepAlive).
# Event loop: polls pending/ for session-end job files, processes them.
#
# Phase 0: validate + log jobs. Synthesis added in Phase 1.
# Phase 1: route to synthesize.sh → team-staging/ → curator approve → GitHub
# Phase 2+: granola_poll_loop, slack_poll_loop added here
#
# Logs: structured JSON to ~/.draft/background/logs/daemon.log
# stdout/stderr are captured by LaunchAgent to logs/daemon.log / logs/daemon-error.log

DRAFT_GLOBAL="$HOME/.draft"
DRAFT_BACKGROUND="$DRAFT_GLOBAL/background"
CONFIG="$DRAFT_BACKGROUND/config.sh"

# Load config — abort if missing (daemon cannot run without it)
if [ ! -f "$CONFIG" ]; then
    echo "[draft-daemon] ERROR: config.sh not found at $CONFIG — daemon cannot start" >&2
    exit 1
fi
# shellcheck source=/dev/null
source "$CONFIG"

# Ensure runtime directories exist
mkdir -p "$DRAFT_PENDING" "$DRAFT_FAILED" "$DRAFT_LOGS"

LOG="$DRAFT_LOGS/daemon.log"
MAX_LOG_LINES=10000   # trim when log exceeds this; keep last 5000

# ── Logging ────────────────────────────────────────────────────────────────────
_log() {
    local level="$1" msg="$2"
    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    printf '{"ts":"%s","level":"%s","msg":"%s"}\n' "$ts" "$level" "$msg" >> "$LOG"
}

_trim_log() {
    if [ -f "$LOG" ]; then
        local lines
        lines=$(wc -l < "$LOG" | tr -d ' ')
        if [ "$lines" -gt "$MAX_LOG_LINES" ]; then
            tail -5000 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
            _log "info" "log trimmed (${lines} -> 5000 lines)"
        fi
    fi
}

# ── Job processing ─────────────────────────────────────────────────────────────
_process_job() {
    local job_file="$1"
    local job_name
    job_name=$(basename "$job_file")

    _log "info" "processing job: $job_name"

    # Validate JSON — malformed files go to failed/
    if ! python3 -c "import json,sys; json.load(open('$job_file'))" 2>/dev/null; then
        _log "error" "invalid JSON in $job_name — quarantining to failed/"
        mv "$job_file" "$DRAFT_FAILED/$job_name"
        return 1
    fi

    # Extract fields from job payload
    local job_profile job_session_id job_project_id job_timestamp
    job_profile=$(python3 -c "
import json
d = json.load(open('$job_file'))
print(d.get('profile', 'default'))
" 2>/dev/null || echo "default")

    job_session_id=$(python3 -c "
import json
d = json.load(open('$job_file'))
print(d.get('session_id', 'unknown'))
" 2>/dev/null || echo "unknown")

    _log "info" "job $job_name: profile=$job_profile session_id=$job_session_id"

    # Phase 1 will replace this block with:
    #   bash "$DRAFT_BACKGROUND/synthesize.sh" "$job_file"
    _log "info" "phase-0: synthesis deferred — job $job_name logged and removed"

    rm -f "$job_file"
    _log "info" "job $job_name complete"
    return 0
}

# ── Main event loop ────────────────────────────────────────────────────────────
_log "info" "draft daemon starting (pid=$$, profile=$DRAFT_ACTIVE_PROFILE, pending_poll=${DRAFT_PENDING_POLL}s)"

LOOP_COUNT=0

while true; do

    # -- Process pending jobs --------------------------------------------------
    for job_file in "$DRAFT_PENDING"/*.json; do
        # Guard: glob returns literal pattern when no files match
        [ -f "$job_file" ] || continue
        _process_job "$job_file" || _log "warn" "job handler returned error for $(basename "$job_file")"
    done

    # -- Periodic log trim (every 1000 loops) ----------------------------------
    LOOP_COUNT=$((LOOP_COUNT + 1))
    if [ $((LOOP_COUNT % 1000)) -eq 0 ]; then
        _trim_log
    fi

    # -- Phase 2+: granola_poll_loop() will be called here --------------------
    # -- Phase 3+: slack_poll_loop() will be called here ----------------------

    sleep "$DRAFT_PENDING_POLL"
done
