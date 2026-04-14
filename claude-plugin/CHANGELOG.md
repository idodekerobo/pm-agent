# Changelog

All notable changes to the Draft plugin will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Version numbers follow [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Fixed
- `session-init.sh` now adds `Write`, `Read`, and `Edit` permissions for `~/.draft/**` to `~/.claude/settings.json` — previously Claude would prompt for permission when writing workspace files on first use
- All `session-init.sh` status messages redirected to stderr

### Changed
- CLAUDE.md loading now uses `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` (set to `~/.draft/workspace`) so Claude Code natively parses the file and executes its `!` bash commands — the previous unconditional `cat` hook injected raw text only, meaning `!` commands (context summaries, priorities, memory) were never actually executed
- `cat ~/.draft/workspace/CLAUDE.md` hook is now conditional: only fires when `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD` is not yet set in the environment (i.e., session 1 only, before `session-init.sh` has written the env var to `settings.json`). From session 2 onwards, native loading takes over and the `cat` hook is skipped to avoid duplication

---

## [1.0.0-beta] — 2026-04-11

Initial release.

### Added
- `SessionStart` hook bootstraps `~/.draft/workspace/` from bundled template on first run
- Hook writes `DRAFT_WORKSPACE`, `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD`, and `additionalDirectories` to `~/.claude/settings.json` so workspace context loads automatically in every future session from any directory
- `@draft-researcher` subagent for retrieving workspace context and web content
- `@draft-executor` subagent for writing product documents (PRDs, decision docs)
- `@draft-learner` subagent for persisting context and memory to `~/.draft/workspace/`
- `/draft:setup` skill for the onboarding interview
- Workspace template with starter context files for all dimensions (company, product, user, team, priorities)

### Platform support
- macOS: supported
- Linux: supported
- Windows: not supported (requires bash; WSL untested)

### Notes
- Workspace lives at `~/.draft/workspace/` — intentionally outside `~/.claude/` so files are accessible by other tools (Codex, etc.)
- Agent files reference `~/.draft/workspace` directly rather than using Claude-specific plugin path variables, to preserve cross-platform portability
