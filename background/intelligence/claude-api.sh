#!/bin/bash
# intelligence/claude-api.sh — Stateless Claude intelligence adapter
#
# Uses `claude -p` (headless print mode) — no tmux, no session, exits when done.
# Receives the full synthesis prompt as a file; all content must be embedded inline
# (no file-reading tools available in this mode). Suitable for Slack batch synthesis
# where the reconstructed markdown is the complete input.
#
# See intelligence/README.md for full adapter contract.
#
# Usage: bash claude-api.sh <prompt_file> <output_file>
# Exit 0: success — output_file written
# Exit 1: failure — logged to stderr

set -uo pipefail

PROMPT_FILE="$1"
OUTPUT_FILE="$2"

_log() {
    printf '[claude-api.sh] %s\n' "$*" >&2
}

if [ ! -f "$PROMPT_FILE" ]; then
    _log "ERROR: prompt file not found: $PROMPT_FILE"
    exit 1
fi

if ! command -v claude &>/dev/null; then
    _log "ERROR: claude CLI not found — install Claude Code to use this adapter"
    exit 1
fi

PROMPT_SIZE=$(wc -c < "$PROMPT_FILE" | tr -d ' ')
_log "calling claude -p (prompt=${PROMPT_SIZE} bytes)"

# Use process substitution to avoid shell argument length limits on large prompts
claude -p "$(cat "$PROMPT_FILE")" > "$OUTPUT_FILE"
EXIT=$?

if [ $EXIT -ne 0 ]; then
    _log "ERROR: claude -p exited $EXIT"
    exit 1
fi

if [ ! -s "$OUTPUT_FILE" ]; then
    _log "ERROR: claude -p returned empty output"
    exit 1
fi

OUTPUT_SIZE=$(wc -c < "$OUTPUT_FILE" | tr -d ' ')
_log "complete (output=${OUTPUT_SIZE} bytes)"
exit 0
