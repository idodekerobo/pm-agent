"""Bootstrap ~/.draft and install Draft agents + skills into ~/.claude.

Entry points:
    install_draft()  — idempotent install; safe to re-run
    is_installed()   — returns True if ~/.draft/.installed exists

Directory layout after install:
    ~/.draft/
      .installed                        sentinel file
      workspace/
        CLAUDE.md                       PM agent orchestration (skip if exists)
        context/                        learned company/product/user context
        memory/                         memory.md cross-session preferences
        docs/prds/                      PRD documents
        docs/decisions/                 decision documents
        templates/                      prd.md, fang-decision-doc.md
        .claude/
          skills/<name>/SKILL.md        integration skill files (always overwrite)

    ~/.claude/
      agents/draft-*.md                 PM subagents (always overwrite)
      skills/<name> → ~/.draft/workspace/.claude/skills/<name>   symlinks
      CLAUDE.md                         draft section appended between markers
"""

import shutil
import sys
from pathlib import Path

import click

# Template bundled into the package at build time (see build.sh).
# In local dev (uv run), fall back to the sibling workspace_template/ directory.
_BUNDLED = Path(__file__).parent / "workspace_template"
_DEV_FALLBACK = Path(__file__).parent.parent / "workspace_template"
_TEMPLATE_DIR = _BUNDLED if _BUNDLED.exists() else _DEV_FALLBACK

_DRAFT_DIR = Path.home() / ".draft"
_DRAFT_WORKSPACE = _DRAFT_DIR / "workspace"
_CLAUDE_DIR = Path.home() / ".claude"
_SENTINEL = _DRAFT_DIR / ".installed"

_DRAFT_MARKER_START = "<!-- draft-start -->"
_DRAFT_MARKER_END = "<!-- draft-end -->"

_DRAFT_CLAUDE_SECTION = """\
<!-- draft-start -->
## Draft PM Agent
- Subagents: `@draft-researcher`, `@draft-executor`, `@draft-learner`
- Integration skills: `/linear`, `/posthog`, `/github`, `/notion`, `/slack`, `/google-drive`, `/google-docs`
<!-- draft-end -->"""


def is_installed() -> bool:
    return _SENTINEL.exists()


def install_draft() -> None:
    """Bootstrap ~/.draft workspace and install Draft into ~/.claude. Idempotent."""
    click.echo("Setting up Draft workspace...")

    _create_workspace_dirs()
    _copy_claude_md()
    _install_skills()
    _install_agents()
    _update_global_claude_md()

    _SENTINEL.touch()
    click.echo("Draft setup complete.")


# ── Steps ─────────────────────────────────────────────────────────────────────

def _create_workspace_dirs() -> None:
    for subdir in [
        "context",
        "memory",
        "docs/prds",
        "docs/decisions",
        "templates",
        ".claude/skills",
    ]:
        (_DRAFT_WORKSPACE / subdir).mkdir(parents=True, exist_ok=True)
    click.echo("  ✓ Created ~/.draft/workspace/")


def _copy_claude_md() -> None:
    src = _TEMPLATE_DIR / "CLAUDE.md"
    dst = _DRAFT_WORKSPACE / "CLAUDE.md"
    shutil.copy2(src, dst)
    click.echo("  ✓ Installed ~/.draft/workspace/CLAUDE.md")


def _install_skills() -> None:
    src_skills = _TEMPLATE_DIR / ".claude" / "skills"
    dst_skills = _DRAFT_WORKSPACE / ".claude" / "skills"
    claude_skills = _CLAUDE_DIR / "skills"
    claude_skills.mkdir(parents=True, exist_ok=True)

    for skill_src in src_skills.iterdir():
        if not skill_src.is_dir():
            continue
        skill_name = skill_src.name
        skill_dst = dst_skills / skill_name

        # Copy skill files into workspace (always overwrite — draft owns these)
        if skill_dst.exists():
            shutil.rmtree(skill_dst)
        shutil.copytree(skill_src, skill_dst)

        # Create symlink ~/.claude/skills/<name> → ~/.draft/workspace/.claude/skills/<name>
        link = claude_skills / skill_name
        if link.exists() or link.is_symlink():
            link.unlink()
        link.symlink_to(skill_dst)

    click.echo(f"  ✓ Installed skills + symlinks into ~/.claude/skills/")


def _install_agents() -> None:
    src_agents = _TEMPLATE_DIR / ".claude" / "agents"
    dst_agents = _CLAUDE_DIR / "agents"
    dst_agents.mkdir(parents=True, exist_ok=True)

    for agent_src in src_agents.glob("draft-*.md"):
        dst = dst_agents / agent_src.name
        shutil.copy2(agent_src, dst)

    click.echo("  ✓ Installed agents into ~/.claude/agents/")


def _update_global_claude_md() -> None:
    claude_md = _CLAUDE_DIR / "CLAUDE.md"

    if claude_md.exists():
        existing = claude_md.read_text()
    else:
        existing = ""

    # Replace existing draft section or append a new one
    if _DRAFT_MARKER_START in existing:
        start = existing.index(_DRAFT_MARKER_START)
        end = existing.index(_DRAFT_MARKER_END) + len(_DRAFT_MARKER_END)
        updated = existing[:start].rstrip() + "\n\n" + _DRAFT_CLAUDE_SECTION + "\n" + existing[end:].lstrip()
    else:
        updated = existing.rstrip() + "\n\n" + _DRAFT_CLAUDE_SECTION + "\n"

    claude_md.write_text(updated)
    click.echo("  ✓ Updated ~/.claude/CLAUDE.md with Draft section")
