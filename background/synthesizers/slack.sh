#!/bin/bash
# synthesizers/slack.sh — Slack message batch source adapter
#
# Receives a context JSON file with paths to reconstructed channel markdown files.
# Reads reconstructed content + current workspace context inline into the prompt.
# Calls the intelligence adapter (default: claude-api, stateless).
# Outputs: YAML frontmatter proposal to stdout (for writing to proposals/).
#
# See synthesizers/README.md for full contract.
#
# Usage: bash synthesizers/slack.sh <context_file>
#   context_file — JSON written by slack-analyzer.sh

set -uo pipefail

CONTEXT_FILE="$1"

DRAFT_BACKGROUND="$HOME/.draft/background"
# shellcheck source=../config.sh
source "$DRAFT_BACKGROUND/config.sh"

_log() {
    printf '[slack.sh] %s\n' "$*" >&2
}

# ── Read context fields ────────────────────────────────────────────────────────

PROFILE=$(python3 -c "
import json
d = json.load(open('$CONTEXT_FILE'))
print(d.get('profile', 'default'))
" 2>/dev/null || echo "default")

ANALYSIS_WINDOW=$(python3 -c "
import json
d = json.load(open('$CONTEXT_FILE'))
print(d.get('analysis_window_hours', 8))
" 2>/dev/null || echo "8")

CURRENT_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# ── Collect reconstructed files ────────────────────────────────────────────────

RECONSTRUCTED_FILES=$(python3 -c "
import json
d = json.load(open('$CONTEXT_FILE'))
files = d.get('reconstructed_files', [])
print('\n'.join(files))
" 2>/dev/null || echo "")

if [ -z "$RECONSTRUCTED_FILES" ]; then
    _log "ERROR: no reconstructed_files in context"
    exit 1
fi

# ── Discover context files dynamically ────────────────────────────────────────

CONTEXT_FILES_LIST=$(find "${DRAFT_WORKSPACE}/context" -maxdepth 2 -name "index.md" 2>/dev/null | sort | sed 's/^/   - /')
CONTEXT_DIMS=$(find "${DRAFT_WORKSPACE}/context" -maxdepth 2 -name "index.md" 2>/dev/null | sort | while IFS= read -r f; do basename "$(dirname "$f")"; done | paste -sd ', ')
if [ -z "$CONTEXT_FILES_LIST" ]; then
    CONTEXT_FILES_LIST="   (no context files found)"
    CONTEXT_DIMS="(none found)"
fi

# ── Build inline channel content (for stateless claude-api adapter) ────────────
# All content embedded in prompt — claude-api cannot read files via tools.

CHANNEL_CONTENT=""
MAX_PER_CHANNEL=20000  # chars

while IFS= read -r rfile; do
    [ -z "$rfile" ] && continue
    [ ! -f "$rfile" ] && continue

    CONTENT=$(head -c "$MAX_PER_CHANNEL" "$rfile" 2>/dev/null || echo "(unreadable)")
    CHANNEL_CONTENT="${CHANNEL_CONTENT}

=== $(basename "$(dirname "$rfile")") ===
${CONTENT}"
done <<< "$RECONSTRUCTED_FILES"

# ── Build inline context content ──────────────────────────────────────────────

CONTEXT_CONTENT=""
while IFS= read -r cfile; do
    [ -z "$cfile" ] && continue
    [ ! -f "$cfile" ] && continue
    DIM=$(basename "$(dirname "$cfile")")
    CONTENT=$(head -c 5000 "$cfile" 2>/dev/null || echo "(unreadable)")
    CONTEXT_CONTENT="${CONTEXT_CONTENT}

--- context/${DIM}/index.md ---
${CONTENT}"
done <<< "$(find "${DRAFT_WORKSPACE}/context" -maxdepth 2 -name "index.md" 2>/dev/null | sort)"

# Also include tensions.md
TENSIONS_FILE="${DRAFT_WORKSPACE}/context/tensions.md"
if [ -f "$TENSIONS_FILE" ]; then
    TENSIONS_CONTENT=$(head -c 3000 "$TENSIONS_FILE" 2>/dev/null || echo "")
    CONTEXT_CONTENT="${CONTEXT_CONTENT}

--- context/tensions.md ---
${TENSIONS_CONTENT}"
fi

# ── Read roles ─────────────────────────────────────────────────────────────────

ROLES_FILE="${DRAFT_WORKSPACE}/config/slack-roles.json"
ROLES_CONTENT=""
if [ -f "$ROLES_FILE" ]; then
    ROLES_CONTENT=$(python3 -c "
import json
d = json.load(open('$ROLES_FILE'))
lines = []
for uid, info in d.items():
    if uid.startswith('__'): continue
    name = info.get('name', uid)
    role = info.get('role', 'team member')
    lines.append(f'  {name} ({role})')
print('\n'.join(lines))
" 2>/dev/null || echo "  (no roles configured)")
fi

# ── Create temp files ─────────────────────────────────────────────────────────

PROMPT_FILE=$(mktemp /tmp/draft-slack-prompt-XXXXXX.txt)
OUTPUT_FILE=$(mktemp /tmp/draft-slack-synthesis-XXXXXX.md)

_cleanup() {
    rm -f "$PROMPT_FILE" "$OUTPUT_FILE"
}
trap _cleanup EXIT

# ── Write synthesis prompt ─────────────────────────────────────────────────────

cat > "$PROMPT_FILE" <<PROMPT
# Draft Synthesis Task — Slack Messages

You are a context synthesis agent for Draft, a shared team context layer for AI sessions.

## Analysis period
Last ${ANALYSIS_WINDOW} hours of Slack activity.
Synthesized at: ${CURRENT_TS}
Profile: ${PROFILE}

## Team roles
Use these roles to weight messages (founder/lead decisions carry more weight):
${ROLES_CONTENT}

## Slack channel content (chronological, thread-nested)
Messages are in time order. Thread replies appear directly under their parent, indented with ↳.
Empty messages (no text, no files, no reactions) are pre-filtered and will not appear.
Messages from unknown senders are kept — they may be from departed teammates and still carry signal.
${CHANNEL_CONTENT}

## Current workspace context
Everything below is already captured — do NOT re-capture it:
${CONTEXT_CONTENT}

## Existing tensions
Already flagged contradictions — do NOT create duplicate tension entries.
(Included in context/tensions.md above)

## Your task
Extract only what would help a teammate start their next AI session with better context.

**SIGNAL — capture:**
- Product decisions or direction changes (look for thread closure, ✅ reactions, founder/lead statements)
- Priority shifts or new constraints
- Technical or architectural decisions
- Customer or user insight surfaced in discussion
- Action items with clear ownership

**NOISE — skip:**
- Logistics, scheduling, casual chat
- Questions without resolution
- Anything already in the workspace context above
- Duplicate tensions already in tensions.md

**Specificity rule:** "Founder decided to shift target user to music directors (Slack #product 2026-05-21)" = SIGNAL.
"Had a discussion about users" = NOISE.

**CONTRADICTIONS — use action: tension:**
When Slack content directly contradicts existing context, route it as a tension:
  - file: context/tensions.md
    action: tension
    content: |
      ### [short name for the contradiction]
      - **Observed:** [YYYY-MM-DD]
      - **Signal:** Slack says "[new value]" but [context/file] says "[existing value]"
      - **Status:** unresolved
      - **Resolution:**

**If nothing team-relevant in the Slack content:** write the document with empty context_updates.

## Output format
Write ONLY the following structure. Three actions allowed:
- "append"   — new info that complements existing context (default)
- "tension"  — contradiction with existing context; always file: context/tensions.md
- "overwrite" — DO NOT USE in synthesis

---
input_source: slack
synthesized_by: ${DRAFT_SLACK_INTELLIGENCE:-claude-api}
timestamp: ${CURRENT_TS}
profile: ${PROFILE}
context_updates:
  - file: context/product/index.md
    action: append
    content: |
      [specific synthesized insight here]
---

## Synthesis preview

### context/product/index.md — append
[same content, human-readable]

## STRICT RULES
- Do NOT ask questions. If ambiguous, omit.
- Do NOT copy raw Slack messages verbatim. Write synthesized insights only.
- Do NOT invent information not present in the messages.
- For contradictions: ALWAYS use action: tension with file: context/tensions.md.
- Write ONLY the document above to stdout. No preamble. No commentary.
PROMPT

_log "prompt written ($(wc -c < "$PROMPT_FILE") bytes), calling intelligence adapter"

# ── Call intelligence adapter ─────────────────────────────────────────────────

INTELLIGENCE="${DRAFT_SLACK_INTELLIGENCE:-claude-api}"
INTELLIGENCE_SCRIPT="$DRAFT_BACKGROUND/intelligence/${INTELLIGENCE}.sh"

if [ ! -x "$INTELLIGENCE_SCRIPT" ]; then
    _log "ERROR: intelligence adapter not found: $INTELLIGENCE_SCRIPT"
    exit 1
fi

bash "$INTELLIGENCE_SCRIPT" "$PROMPT_FILE" "$OUTPUT_FILE"
INTEL_EXIT=$?

if [ $INTEL_EXIT -ne 0 ]; then
    _log "ERROR: intelligence adapter exited $INTEL_EXIT"
    exit 1
fi

if [ ! -f "$OUTPUT_FILE" ] || [ ! -s "$OUTPUT_FILE" ]; then
    _log "ERROR: intelligence adapter returned empty output"
    exit 1
fi

FIRST_LINE=$(head -1 "$OUTPUT_FILE")
if [ "$FIRST_LINE" != "---" ]; then
    _log "WARN: output does not start with YAML frontmatter (---) — passing through anyway"
fi

_log "synthesis complete ($(wc -c < "$OUTPUT_FILE") bytes)"
cat "$OUTPUT_FILE"
exit 0
