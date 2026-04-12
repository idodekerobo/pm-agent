# Draft — Claude Code Plugin

AI-powered PM co-pilot. Gives Claude persistent memory about your product, priorities, and context so every session starts grounded — from any directory.

---

## Plugin structure

```
claude-plugin/
├── .claude-plugin/
│   └── plugin.json               Plugin manifest (name: "draft", v0.1.0)
├── agents/
│   ├── draft-researcher.md       Finds and retrieves information
│   ├── draft-executor.md         Takes concrete actions (writes docs, calls integrations)
│   └── draft-learner.md          Updates persistent memory files
├── skills/
│   └── setup/SKILL.md            /draft:setup — onboarding interview skill
├── hooks/
│   └── hooks.json                SessionStart → session-init.sh
├── scripts/
│   └── session-init.sh           Guarded bootstrap + settings.json configuration
├── workspace-template/           Blank workspace copied to plugin data dir on first run
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
   - Copies `workspace-template/` → `$CLAUDE_PLUGIN_DATA` (e.g. `~/.claude/plugins/data/draft/`)
   - This is the persistent workspace that survives plugin updates

3. **`~/.claude/settings.json` configuration** (guarded — runs once):
   ```json
   {
     "env": {
       "DRAFT_WORKSPACE": "~/.claude/plugins/data/draft/",
       "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD": "1"
     },
     "permissions": {
       "additionalDirectories": ["~/.claude/plugins/data/draft/"]
     }
   }
   ```
   - `DRAFT_WORKSPACE` — env var pointing to the persistent workspace; used by `!` bash commands in `CLAUDE.md`
   - `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` — tells Claude Code to load `CLAUDE.md` from additional directories
   - `additionalDirectories` — makes the workspace directory accessible from any working directory

4. **First session ends without full PM context** — settings are now written but take effect on the next session start

### Every subsequent session

1. **`SessionStart` hook fires** → `session-init.sh` runs all guards, finds nothing to do, exits in <10ms

2. **Claude Code loads `CLAUDE.md` from the workspace** via `additionalDirectories` + `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD`

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
- **Context dimension summaries** — frontmatter `description` fields from each `context/*/index.md` (company, product, priorities, team, user)
- **Full priorities file** — complete `context/priorities/index.md` including sprint tasks, open questions, deferred work
- **Memory** — `memory/memory.md` with vocabulary, preferences, goals, patterns

If the workspace has no context yet (fresh install), all dynamic sections fall back to "No context loaded yet — run /draft:setup."

---

## Path conventions

| Variable | Resolves to | Used in |
|---|---|---|
| `$CLAUDE_PLUGIN_DATA` | `~/.claude/plugins/data/draft/` | `session-init.sh`, agent files |
| `$DRAFT_WORKSPACE` | same path (set by `session-init.sh`) | `CLAUDE.md` `!` bash commands |
| `${CLAUDE_PLUGIN_DATA}` | same path (auto-substituted by plugin runtime) | agent `.md` files |

`CLAUDE.md` uses `$DRAFT_WORKSPACE` (env var route) because `${CLAUDE_PLUGIN_DATA}` substitution is only guaranteed in agent/skill content, not in files loaded via `additionalDirectories`.

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
ls ~/.claude/plugins/data/draft/
```

---

## Subagents

| Agent | When to use |
|---|---|
| `@draft-researcher` | Need to KNOW something — read files, query integrations, fetch web content |
| `@draft-executor` | Need to DO something — write a PRD, create a Linear issue, send a Slack message |
| `@draft-learner` | Need to REMEMBER something — update context files, log decisions, merge new info |

Most requests follow: `@draft-researcher` gathers context → `@draft-executor` acts → `@draft-learner` saves.
