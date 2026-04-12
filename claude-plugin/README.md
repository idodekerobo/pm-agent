# Draft — Claude Code Plugin

AI-powered PM co-pilot. Gives Claude persistent memory about your product, priorities, and context so every session starts grounded — from any directory.

> **Platform support: macOS and Linux only.** The plugin's session hook is a bash script and requires a POSIX shell environment. Windows (including WSL) is untested and not currently supported.

---

## Plugin structure

```
claude-plugin/
├── .claude-plugin/
│   └── plugin.json               Plugin manifest (name: "draft", v0.1.0)
├── agents/
│   ├── draft-researcher.md       Finds and retrieves information
│   ├── draft-executor.md         Takes concrete actions (writes docs)
│   └── draft-learner.md          Updates persistent memory files
├── skills/
│   └── setup/SKILL.md            /draft:setup — onboarding interview skill
├── hooks/
│   └── hooks.json                SessionStart → session-init.sh
├── scripts/
│   └── session-init.sh           Guarded bootstrap + settings.json configuration
├── workspace-template/           Blank workspace copied to ~/.draft/workspace on first run
│   ├── CLAUDE.md                 PM agent instructions (loaded as system context)
│   ├── context/
│   │   ├── company/index.md
│   │   ├── product/index.md
│   │   ├── priorities/index.md
│   │   ├── team/index.md
│   │   ├── user/index.md
│   │   └── tensions.md
│   └── memory/
│       └── memory.md
└── README.md
```

---

## How it works

### First session (after install)

1. **`SessionStart` hook fires** → runs `scripts/session-init.sh`

2. **Workspace bootstrap** (guarded — runs once):
   - Copies `workspace-template/` → `~/.draft/workspace/`
   - This is the persistent workspace, intentionally outside `~/.claude/` so it works across tools

3. **`~/.claude/settings.json` configuration** (guarded — runs once):
   ```json
   {
     "env": {
       "DRAFT_WORKSPACE": "~/.draft/workspace",
       "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD": "1"
     },
     "permissions": {
       "additionalDirectories": ["~/.draft/workspace"]
     }
   }
   ```
   - `DRAFT_WORKSPACE` — env var pointing to the workspace; used by `!` bash commands in `CLAUDE.md`
   - `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` — tells Claude Code to load `CLAUDE.md` from additional directories
   - `additionalDirectories` — makes the workspace accessible from any working directory

4. **Settings take effect on the next session start**

### Every subsequent session

1. **`SessionStart` hook fires** → all guards pass, exits in <10ms

2. **Claude Code loads `CLAUDE.md` from `~/.draft/workspace/`** via `additionalDirectories` + `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD`

3. **`!` bash commands in `CLAUDE.md` execute**, injecting live workspace state into the system prompt:
   - `tree` of `$DRAFT_WORKSPACE/context/` — shows what dimensions exist
   - Python script reading `context/*/index.md` frontmatter — loads dimension summaries
   - `cat $DRAFT_WORKSPACE/context/priorities/index.md` — loads full current priorities
   - `cat $DRAFT_WORKSPACE/memory/memory.md` — loads vocabulary, preferences, patterns

---

## What's injected into the system prompt

On every session (after first run), the following is loaded automatically:

### Static (from `workspace-template/CLAUDE.md`)
- PM agent persona and role definition
- Delegation rules for the three subagents
- Request handling instructions (orient → clarify → delegate → surface tensions → present)
- Staleness policy for context files
- Proactive memory rules
- Workspace file conventions and path references

### Dynamic (from `!` bash commands, runs at session start)
- **Workspace tree** — directory listing of `context/` so Claude knows what exists
- **Context dimension summaries** — frontmatter `description` fields from each `context/*/index.md`
- **Full priorities file** — complete `context/priorities/index.md`
- **Memory** — `memory/memory.md` with vocabulary, preferences, goals, patterns

If the workspace has no context yet, all dynamic sections fall back to "No context loaded yet — run /draft:setup."

---

## Path conventions

| Variable | Resolves to | Used in |
|---|---|---|
| `$DRAFT_WORKSPACE` | `~/.draft/workspace` (set by `session-init.sh`) | `CLAUDE.md` `!` bash commands, agent instructions |

All agent files reference `~/.draft/workspace` directly as a hardcoded path. This keeps the workspace location tool-agnostic — the same files can be read by Codex or any other tool without requiring Claude Code-specific path resolution.

---

## Testing locally

```bash
# Load the plugin for a single session (dev/test)
claude --plugin-dir ./claude-plugin

# After first session, verify settings were written
cat ~/.claude/settings.json | python3 -m json.tool

# Run the setup interview
/draft:setup

# Verify workspace was created
ls ~/.draft/workspace/
```

---

## Subagents

| Agent | When to use |
|---|---|
| `@draft-researcher` | Need to KNOW something — read workspace files, fetch web content |
| `@draft-executor` | Need to DO something — write a PRD, create a decision doc |
| `@draft-learner` | Need to REMEMBER something — update context files, log decisions, merge new info |

Most requests follow: `@draft-researcher` gathers context → `@draft-executor` acts → `@draft-learner` saves.
