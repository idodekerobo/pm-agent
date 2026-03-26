---
name: linear
description: >
  Manage Linear issues, teams, projects, and cycles from the command line.
  Use when creating issues, updating status, finding assigned work, querying
  team backlogs, or any Linear workspace operation.
allowed-tools: Bash(linear:*), Bash(curl:*)
---

# Linear CLI

A CLI to manage Linear issues from the command line.

## Authentication

`LINEAR_API_KEY` is pre-injected into the environment. Pass it inline for each command:

```bash
LINEAR_API_KEY=$LINEAR_API_KEY linear issue list --team ENG --sort priority
```

Never run `linear config` in an interactive way — always use inline env vars and flags.

---

## Known Gotchas

Read these before issuing any command. Violating these rules will cause errors.

**Sort is always required.**
```bash
# Correct
linear issue list --team ENG --sort priority

# Wrong — will error: "Sort must be provided via command line flag..."
linear issue list --team ENG
```

**`--all-states` and `--state` are mutually exclusive.**
```bash
# Correct
linear issue list --team ENG --sort priority --all-states
linear issue list --team ENG --sort priority --state started

# Wrong
linear issue list --team ENG --all-states --state started
```

**Valid `--state` values are lowercase:** `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`

**`--team` is always required.** Run `linear team list` first if you don't know the team key.

**`--no-pager` is not supported on all commands.** Don't use it on `linear team list`.

---

## Common Commands

### List issues

```bash
# Basic listing — always pass --sort and --team
LINEAR_API_KEY=$LINEAR_API_KEY linear issue list --team ENG --sort priority

# Filter by state
LINEAR_API_KEY=$LINEAR_API_KEY linear issue list --team ENG --sort priority --state started
LINEAR_API_KEY=$LINEAR_API_KEY linear issue list --team ENG --sort priority --all-states

# Filter by assignee
LINEAR_API_KEY=$LINEAR_API_KEY linear issue list --team ENG --sort priority --assignee self
LINEAR_API_KEY=$LINEAR_API_KEY linear issue list --team ENG --sort priority --all-assignees
```

### View an issue

Always specify the issue ID explicitly:

```bash
LINEAR_API_KEY=$LINEAR_API_KEY linear issue view TEAM-123
LINEAR_API_KEY=$LINEAR_API_KEY linear issue view TEAM-123 --no-comments
```

### Create an issue

Use `--description-file` for multi-line descriptions to avoid shell escaping issues:

```bash
# Write description to temp file first
cat > /tmp/issue-desc.md <<'EOF'
## Summary

What needs to be done.

## Details

More context here.
EOF

LINEAR_API_KEY=$LINEAR_API_KEY linear issue create \
  --team ENG \
  --title "Feature title" \
  --description-file /tmp/issue-desc.md \
  --priority 2 \
  --assignee self
```

Only use inline `--description` for simple single-line content.

### Update an issue

```bash
LINEAR_API_KEY=$LINEAR_API_KEY linear issue update TEAM-123 --milestone "Q2"
```

### Teams and projects

```bash
# List teams
LINEAR_API_KEY=$LINEAR_API_KEY linear team list

# List projects
LINEAR_API_KEY=$LINEAR_API_KEY linear project list
```

---

## Using the GraphQL API Directly

Prefer the CLI. Use `linear api` only for queries not covered by the CLI.

```bash
# Simple query
LINEAR_API_KEY=$LINEAR_API_KEY linear api '{ viewer { id name email } }'

# Query with variables — use heredoc to avoid escaping issues
LINEAR_API_KEY=$LINEAR_API_KEY linear api --variable teamId=abc123 <<'GRAPHQL'
query($teamId: String!) { team(id: $teamId) { name } }
GRAPHQL

# Search issues by text
LINEAR_API_KEY=$LINEAR_API_KEY linear api --variable term=onboarding <<'GRAPHQL'
query($term: String!) { searchIssues(term: $term, first: 20) { nodes { identifier title state { name } } } }
GRAPHQL
```

### Write schema to tempfile, then search it

```bash
LINEAR_API_KEY=$LINEAR_API_KEY linear schema -o /tmp/linear-schema.graphql
grep -i "cycle" /tmp/linear-schema.graphql
```
