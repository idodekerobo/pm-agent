---
name: linear-cli
description: Manage Linear issues, teams, and projects from the command line. This skill allows automating linear management including creating issues, updating status, and managing workflows.
allowed-tools: Bash(linear:*), Bash(curl:*)
---

# Linear CLI

A CLI to manage Linear issues from the command line, with git and jj integration.

## Prerequisites

The `linear` command must be available on PATH. **Do not run `linear --version` to check** — assume it is installed and proceed directly to your task.

If not installed, follow the instructions at:
https://github.com/schpet/linear-cli?tab=readme-ov-file#install

## Known Gotchas

Read these before issuing any command. Violating these rules will cause errors.

**Sort is always required.** There is no default sort. You must always pass `--sort` or the command will fail:
```bash
# Correct
linear issue list --team ENG --sort priority

# Wrong — will error: "Sort must be provided via command line flag..."
linear issue list --team ENG
```

**`--all-states` and `--state` are mutually exclusive.** Never use them together:
```bash
# Correct: use --all-states alone
linear issue list --team ENG --sort priority --all-states

# Correct: use --state for specific states
linear issue list --team ENG --sort priority --state started --state unstarted

# Wrong — will error: "Cannot use --all-states with --state flag"
linear issue list --team ENG --all-states --state started
```

**Valid `--state` values are lowercase.** The CLI rejects capitalized state names:
```bash
# Correct
linear issue list --state unstarted --state started

# Wrong — will error: 'must be of type "state", but got "Todo"'
linear issue list --state Todo --state "In Progress"
```
Valid values: `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`

**Team is always required.** The CLI cannot infer a team from the directory in ephemeral environments. Always pass `--team`:
```bash
# Correct
linear issue list --team ENG --sort priority

# Wrong — will error: "Could not determine team key from directory name or team flag"
linear issue list --sort priority
```

If you don't know the team key, run `linear team list` first to get it.

**`--no-pager` is not supported on all commands.** For example, `linear team list` does not support `--no-pager` and will error. Only use it on commands where it is documented.

## Configuration

### Interactive Configuration (Local Dev)

Run `linear config` to interactively generate a `.linear.toml` file.

### Stateless / Ephemeral Usage (Agents & CI)

For agents or CI/CD environments where you cannot persist configuration files or shell sessions, use **inline environment variables** combined with **command flags**.

**Authentication:**
You must provide the API key via `LINEAR_API_KEY`.

**Configuration Flags:**
Use these flags to specify context for each command:

| Config | Flag | Example |
|--------|------|---------|
| Team | `--team` | `linear issue list --team ENG` |
| Sort | `--sort` | `linear issue list --sort priority` |
| State | `--state` | `linear issue list --state started` |

**Configuration via Inline Env Vars:**
For options without flags (like Workspace), prepend the variable to the command:

```bash
# Example: List issues for 'ENG' team in 'my-company' workspace
LINEAR_API_KEY=lin_api_... LINEAR_WORKSPACE=my-company linear issue list --team ENG --sort priority
```

**Recommended baseline command for listing issues in ephemeral environments:**
```bash
linear issue list --team ENG --sort priority --all-assignees
```

## Common Commands

### Issues

#### List Issues

List your issues (shows unstarted issues by default):

```bash
linear issue list
```

Filter by state:
```bash
# List started issues
linear issue list --state started

# List all issues regardless of state
linear issue list --all-states

# List multiple states
linear issue list --state unstarted --state started
```

Filter by assignee:
```bash
# List issues assigned to you
linear issue list --assignee self

# List issues assigned to specific user
linear issue list --assignee username

# List all unassigned issues
linear issue list --unassigned

# List issues for all assignees
linear issue list --all-assignees
```

Other options:
```bash
# List issues for specific team
linear issue list --team TEAM_ID

# Sort by priority instead of manual order
linear issue list --sort priority

# Open in web browser
linear issue list --web
```

#### View Issue Details

The CLI determines the "current issue" based on the git branch name (e.g., `eng-123-feature`) or `jj` commit trailers.

**In ephemeral environments**, always specify the Issue ID explicitly to avoid relying on git context:

```bash
# View specific issue
linear issue view TEAM-123

# View in browser
linear issue view TEAM-123 --web

# View in Linear app
linear issue view TEAM-123 --app

# Exclude comments
linear issue view TEAM-123 --no-comments
```

#### Create an Issue

Create an issue interactively:
```bash
linear issue create
```

Create with specific flags (recommended for automation):
```bash
# Create with title and description
linear issue create --title "Fix bug" --description "Description here"

# Create and assign to yourself
linear issue create --assignee self

# Create with priority (1-4, where 1 is highest)
linear issue create --priority 1

# Create with estimate points
linear issue create --estimate 3

# Create with labels
linear issue create --label bug --label frontend

# Create for specific team
linear issue create --team TEAM_ID

# Create and start working on it (creates branch)
linear issue create --start
```

#### Start Working

```bash
# Start the next available issue
linear issue start

# Start a specific issue (moves to "In Progress" and creates branch)
linear issue start TEAM-123
```

#### Update an Issue

```bash
# Update current issue
linear issue update

# Update specific issue
linear issue update TEAM-123 --milestone "Phase 2"
```

#### Other Issue Commands

```bash
# Get issue ID from current branch
linear issue id

# Get issue title
linear issue title TEAM-123

# Create a GitHub PR for the issue
linear issue pr

# Delete an issue
linear issue delete TEAM-123
```

### Teams

```bash
# List teams
linear team list

# Get team ID (derived from repo name or config)
linear team id

# List team members
linear team members
linear team members TEAM_ID

# Create a team
linear team create

# Configure GitHub autolinks
linear team autolinks
```

### Projects

```bash
# List projects
linear project list

# View project details
linear project view PROJECT_ID
```

### Milestones

```bash
# List milestones for a project
linear milestone list --project PROJECT_ID

# View milestone
linear milestone view MILESTONE_ID

# Create milestone
linear milestone create --project PROJECT_ID --name "Q1 Goals" --target-date "2026-03-31"
```

### Documents

```bash
# List documents
linear document list
linear document list --project PROJECT_ID

# View document
linear document view SLUG

# Create document
linear document create --title "Spec" --content-file ./spec.md
```

## Best Practices for Markdown Content

When working with issue descriptions or comment bodies that contain markdown, **always prefer using file-based flags** instead of passing content as command-line arguments:

- Use `--description-file` for `issue create` and `issue update` commands
- Use `--body-file` for `comment add` and `comment update` commands

**Why use file-based flags:**

- Ensures proper formatting in the Linear web UI
- Avoids shell escaping issues with newlines and special characters
- Prevents literal `\n` sequences from appearing in markdown
- Makes it easier to work with multi-line content

**Example workflow:**

```bash
# Write markdown to a temporary file
cat > /tmp/description.md <<'EOF'
## Summary

- First item
- Second item

## Details

This is a detailed description with proper formatting.
EOF

# Create issue using the file
linear issue create --title "My Issue" --description-file /tmp/description.md

# Or for comments
linear issue comment add ENG-123 --body-file /tmp/comment.md
```

**Only use inline flags** (`--description`, `--body`) for simple, single-line content.

## Using the Linear GraphQL API Directly

**Prefer the CLI for all supported operations.** The `api` command should only be used as a fallback for queries not covered by the CLI.

### Check the schema for available types and fields

Write the schema to a tempfile, then search it:

```bash
linear schema -o "${TMPDIR:-/tmp}/linear-schema.graphql"
grep -i "cycle" "${TMPDIR:-/tmp}/linear-schema.graphql"
grep -A 30 "^type Issue " "${TMPDIR:-/tmp}/linear-schema.graphql"
```

### Make a GraphQL request

**Important:** GraphQL queries containing non-null type markers (e.g. `String` followed by an exclamation mark) must be passed via heredoc stdin to avoid escaping issues. Simple queries without those markers can be passed inline.

```bash
# Simple query (no type markers, so inline is fine)
linear api '{ viewer { id name email } }'

# Query with variables — use heredoc to avoid escaping issues
linear api --variable teamId=abc123 <<'GRAPHQL'
query($teamId: String!) { team(id: $teamId) { name } }
GRAPHQL

# Search issues by text
linear api --variable term=onboarding <<'GRAPHQL'
query($term: String!) { searchIssues(term: $term, first: 20) { nodes { identifier title state { name } } } }
GRAPHQL

# Numeric and boolean variables
linear api --variable first=5 <<'GRAPHQL'
query($first: Int!) { issues(first: $first) { nodes { title } } }
GRAPHQL

# Complex variables via JSON
linear api --variables-json '{"filter": {"state": {"name": {"eq": "In Progress"}}}}' <<'GRAPHQL'
query($filter: IssueFilter!) { issues(filter: $filter) { nodes { title } } }
GRAPHQL

# Pipe to jq for filtering
linear api '{ issues(first: 5) { nodes { identifier title } } }' | jq '.data.issues.nodes[].title'
```

### Advanced: Using curl directly

For cases where you need full HTTP control, use `linear auth token`:

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $(linear auth token)" \
  -d '{"query": "{ viewer { id } }"}'
```
