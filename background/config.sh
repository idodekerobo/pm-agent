#!/bin/bash
# config.sh — Draft daemon configuration
#
# Source this file from other background scripts:
#   source "$(dirname "${BASH_SOURCE[0]}")/config.sh"
#
# Exports:
#   DRAFT_GLOBAL, DRAFT_ACTIVE_PROFILE, DRAFT_WORKSPACE
#   DRAFT_BACKGROUND, DRAFT_PENDING, DRAFT_FAILED, DRAFT_LOGS, DRAFT_STAGING
#   DRAFT_CONFIG, DRAFT_SECRETS, DRAFT_LOCAL
#   DRAFT_PENDING_POLL, DRAFT_GRANOLA_POLL, DRAFT_SLACK_CAPTURE, DRAFT_SLACK_ANALYSIS

DRAFT_GLOBAL="$HOME/.draft"
DRAFT_BACKGROUND="$DRAFT_GLOBAL/background"

# ── Active profile ─────────────────────────────────────────────────────────────
# Read ~/.draft/active-profile. Falls back to "default" if missing or empty.
DRAFT_ACTIVE_PROFILE="default"
_profile_file="$DRAFT_GLOBAL/active-profile"
if [ -f "$_profile_file" ]; then
    _read_profile=$(tr -d '[:space:]' < "$_profile_file")
    if [ -n "$_read_profile" ]; then
        DRAFT_ACTIVE_PROFILE="$_read_profile"
    fi
fi

# ── Paths ──────────────────────────────────────────────────────────────────────
DRAFT_WORKSPACE="$DRAFT_GLOBAL/workspaces/$DRAFT_ACTIVE_PROFILE"
DRAFT_PENDING="$DRAFT_BACKGROUND/pending"
DRAFT_FAILED="$DRAFT_BACKGROUND/failed"
DRAFT_LOGS="$DRAFT_BACKGROUND/logs"
DRAFT_STAGING="$DRAFT_WORKSPACE/proposals"

# Per-profile config files
DRAFT_CONFIG="$DRAFT_WORKSPACE/config"
DRAFT_SECRETS="$DRAFT_CONFIG/secrets.json"   # daemon-only creds (Slack, Granola)
DRAFT_LOCAL="$DRAFT_CONFIG/local.json"       # Gate B creds (GitHub token)

# ── Polling defaults ───────────────────────────────────────────────────────────
# All intervals are in seconds. Override via environment variable.
#
# DRAFT_PENDING_POLL   — how often to check pending/ queue          (default: 5s)
# DRAFT_GRANOLA_POLL   — how often to check for new Granola txcpts  (default: 5min)
# DRAFT_SLACK_CAPTURE  — how often to poll Slack REST API           (default: 5min)
# DRAFT_SLACK_ANALYSIS — how often to run Slack synthesis batch     (default: 4hr)

DRAFT_PENDING_POLL="${DRAFT_PENDING_POLL:-5}"
DRAFT_GRANOLA_POLL="${DRAFT_GRANOLA_POLL:-300}"
DRAFT_SLACK_CAPTURE="${DRAFT_SLACK_CAPTURE:-300}"
DRAFT_SLACK_ANALYSIS="${DRAFT_SLACK_ANALYSIS:-14400}"

# ── Exports ────────────────────────────────────────────────────────────────────
export DRAFT_GLOBAL DRAFT_ACTIVE_PROFILE DRAFT_WORKSPACE
export DRAFT_BACKGROUND DRAFT_PENDING DRAFT_FAILED DRAFT_LOGS DRAFT_STAGING
export DRAFT_CONFIG DRAFT_SECRETS DRAFT_LOCAL
export DRAFT_PENDING_POLL DRAFT_GRANOLA_POLL DRAFT_SLACK_CAPTURE DRAFT_SLACK_ANALYSIS
