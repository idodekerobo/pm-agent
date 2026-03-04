---
name: github
description: Read and manage GitHub repositories, issues, pull requests, projects, and more using the gh CLI.
allowed-tools: Bash(gh:*)
---

# GitHub CLI (gh)

## Authentication

`GITHUB_TOKEN` is pre-injected into the environment before this skill runs. The `gh` CLI automatically picks it up — you do not need to authenticate manually. Never run `gh auth login` or `gh auth setup-git`.

---

## Core Concepts

### Specifying a repository

Every command accepts `-R <OWNER/REPO>` (or `--repo`) to target a specific repository. Without it, `gh` uses the repo in the current directory (if any).

```bash
gh issue list -R acme/backend
gh pr view 42 -R acme/backend
```

### Output formatting

All list and view commands support structured output:

| Flag | Description |
|------|-------------|
| `--json <fields>` | Return JSON with specific fields (comma-separated) |
| `-q, --jq <expr>` | Filter/transform JSON output using jq syntax |
| `-t, --template <tmpl>` | Format JSON using a Go template |

```bash
# Get PR titles and numbers as JSON
gh pr list -R acme/backend --json number,title

# Extract just the state of a PR
gh pr view 42 -R acme/backend --json state --jq '.state'

# List only open issues assigned to me
gh issue list -R acme/backend --json number,title,assignees \
  --jq '.[] | select(.assignees[].login == "me")'
```

---

## Repositories (`gh repo`)

### List repositories

```
gh repo list [<owner>] [flags]
```

| Flag | Description |
|------|-------------|
| `-L, --limit <int>` | Max results (default: 30) |
| `--visibility <string>` | Filter: `public`, `private`, `internal` |
| `--language <string>` | Filter by primary language |
| `--topic <string>` | Filter by topic tag |
| `--archived` | Show only archived repos |
| `--no-archived` | Exclude archived repos |
| `--fork` | Show only forks |
| `--source` | Show only non-forks |
| `--json <fields>` | Output as JSON |

```bash
# List all repos for an org
gh repo list acme-corp --limit 100

# List private repos only
gh repo list acme-corp --visibility private

# Get repo names as JSON
gh repo list acme-corp --json name,url,isPrivate
```

### View a repository

```
gh repo view [<owner/repo>] [flags]
```

| Flag | Description |
|------|-------------|
| `-b, --branch <string>` | View a specific branch |
| `--json <fields>` | Output as JSON |

```bash
gh repo view acme/backend
gh repo view acme/backend --json name,description,defaultBranchRef,languages
```

### Clone a repository

```
gh repo clone <owner/repo> [<dir>] [-- <git flags>]
```

| Flag | Description |
|------|-------------|
| `-u, --upstream-remote-name <string>` | Name for the upstream remote (default: `upstream`). Use `@owner` to name after parent owner. |

```bash
gh repo clone acme/backend
gh repo clone acme/backend ./local-dir
gh repo clone acme/backend -- --depth=1   # pass extra git flags after --
```

### Create a repository

```
gh repo create [<name>] [flags]
```

| Flag | Description |
|------|-------------|
| `--public` / `--private` / `--internal` | Visibility (required unless interactive) |
| `-d, --description <string>` | Repository description |
| `--add-readme` | Initialize with a README |
| `-g, --gitignore <template>` | Add a .gitignore template (e.g. `Python`, `Node`) |
| `-l, --license <spdx>` | Add a license (e.g. `MIT`, `Apache-2.0`) |
| `-c, --clone` | Clone the new repo after creating |
| `-s, --source <path>` | Create from an existing local directory |
| `--push` | Push local commits to the new repo (use with `--source`) |
| `-p, --template <owner/repo>` | Create from a template repo |
| `--disable-issues` | Disable issues |
| `--disable-wiki` | Disable wiki |
| `-t, --team <name>` | Grant access to an org team |

```bash
# Create a private repo
gh repo create acme/new-service --private --description "New service"

# Create from local directory and push
gh repo create acme/new-service --private --source=. --push

# Create public repo with README and MIT license
gh repo create my-lib --public --add-readme --license MIT
```

---

## Issues (`gh issue`)

### List issues

```
gh issue list [flags]
```

| Flag | Description |
|------|-------------|
| `-s, --state <string>` | Filter: `open` (default), `closed`, `all` |
| `-a, --assignee <string>` | Filter by assignee login; `@me` for yourself |
| `-A, --author <string>` | Filter by author login |
| `-l, --label <strings>` | Filter by label (repeatable) |
| `-m, --milestone <string>` | Filter by milestone name or number |
| `-S, --search <query>` | GitHub search query syntax |
| `--mention <string>` | Issues mentioning a user |
| `-L, --limit <int>` | Max results (default: 30) |
| `-R, --repo <OWNER/REPO>` | Target repository |
| `--json <fields>` | Output as JSON |

```bash
gh issue list -R acme/backend --state open
gh issue list -R acme/backend --assignee @me --label bug
gh issue list -R acme/backend --search "memory leak sort:created-desc" --limit 10
gh issue list -R acme/backend --json number,title,state,assignees,labels
```

### View an issue

```
gh issue view <number> [flags]
```

| Flag | Description |
|------|-------------|
| `-c, --comments` | Show comments |
| `--json <fields>` | Output as JSON |
| `-R, --repo <OWNER/REPO>` | Target repository |

```bash
gh issue view 42 -R acme/backend
gh issue view 42 -R acme/backend --comments
gh issue view 42 -R acme/backend --json number,title,body,state,assignees,labels,comments
```

### Create an issue

```
gh issue create [flags]
```

| Flag | Description |
|------|-------------|
| `-t, --title <string>` | Issue title |
| `-b, --body <string>` | Issue body (markdown supported) |
| `-F, --body-file <file>` | Read body from a file |
| `-a, --assignee <login>` | Assign to user(s); `@me` for yourself; repeatable |
| `-l, --label <name>` | Add label(s); repeatable or comma-separated |
| `-m, --milestone <name>` | Assign to a milestone |
| `-p, --project <title>` | Add to a project |
| `-T, --template <name>` | Use an issue template |
| `-R, --repo <OWNER/REPO>` | Target repository |

```bash
gh issue create -R acme/backend \
  --title "Auth token expires too quickly" \
  --body "Users report being logged out after 15 minutes." \
  --label bug --assignee @me

gh issue create -R acme/backend \
  --title "Add rate limiting" \
  --label enhancement --milestone "v2.0"
```

### Edit an issue

```
gh issue edit <number> [flags]
```

| Flag | Description |
|------|-------------|
| `--title <string>` | New title |
| `--body <string>` | New body |
| `--add-label <name>` | Add label(s) |
| `--remove-label <name>` | Remove label(s) |
| `--add-assignee <login>` | Add assignee(s) |
| `--remove-assignee <login>` | Remove assignee(s) |
| `--milestone <name>` | Set milestone |
| `-R, --repo <OWNER/REPO>` | Target repository |

```bash
gh issue edit 42 -R acme/backend --add-label "priority:high" --add-assignee alice
```

### Other issue commands

```bash
gh issue close 42 -R acme/backend
gh issue reopen 42 -R acme/backend
gh issue comment 42 -R acme/backend --body "Looking into this now."
```

---

## Pull Requests (`gh pr`)

### List pull requests

```
gh pr list [flags]
```

| Flag | Description |
|------|-------------|
| `-s, --state <string>` | Filter: `open` (default), `closed`, `merged`, `all` |
| `-a, --assignee <string>` | Filter by assignee |
| `-A, --author <string>` | Filter by author |
| `-B, --base <string>` | Filter by base branch |
| `-H, --head <string>` | Filter by head branch |
| `-l, --label <strings>` | Filter by label |
| `-d, --draft` | Show only drafts |
| `-S, --search <query>` | GitHub search query syntax |
| `-L, --limit <int>` | Max results (default: 30) |
| `-R, --repo <OWNER/REPO>` | Target repository |
| `--json <fields>` | Output as JSON |

```bash
gh pr list -R acme/backend --state open
gh pr list -R acme/backend --author alice --state merged --limit 20
gh pr list -R acme/backend --json number,title,state,author,baseRefName,headRefName
```

### View a pull request

```
gh pr view [<number|url|branch>] [flags]
```

| Flag | Description |
|------|-------------|
| `-c, --comments` | Show PR comments |
| `--json <fields>` | Output as JSON |
| `-R, --repo <OWNER/REPO>` | Target repository |

```bash
gh pr view 99 -R acme/backend
gh pr view 99 -R acme/backend --comments
gh pr view 99 -R acme/backend --json number,title,body,state,author,baseRefName,headRefName,commits,reviews,files
```

### Create a pull request

```
gh pr create [flags]
```

| Flag | Description |
|------|-------------|
| `-t, --title <string>` | PR title |
| `-b, --body <string>` | PR description (markdown supported) |
| `-F, --body-file <file>` | Read body from a file |
| `-B, --base <branch>` | Target branch to merge into (default: repo default) |
| `-H, --head <branch>` | Source branch (default: current) |
| `-d, --draft` | Create as draft |
| `-f, --fill` | Auto-fill title and body from commit messages |
| `--fill-verbose` | Fill using full commit messages |
| `-a, --assignee <login>` | Assign to user(s) |
| `-r, --reviewer <handle>` | Request review from user(s) or team(s) |
| `-l, --label <name>` | Add label(s) |
| `-m, --milestone <name>` | Assign to milestone |
| `-p, --project <title>` | Add to project |
| `--dry-run` | Preview without creating |
| `-R, --repo <OWNER/REPO>` | Target repository |

```bash
gh pr create -R acme/backend \
  --title "Add rate limiting middleware" \
  --body "Closes #42. Implements token bucket algorithm." \
  --base main --draft --reviewer alice,bob

# Auto-fill from commits
gh pr create -R acme/backend --fill --base main
```

### Merge a pull request

```
gh pr merge [<number|url|branch>] [flags]
```

| Flag | Description |
|------|-------------|
| `--merge` | Create a merge commit |
| `--squash` | Squash commits into one |
| `--rebase` | Rebase commits onto base branch |
| `--auto` | Merge automatically when checks pass |
| `--delete-branch` | Delete the branch after merge |
| `-R, --repo <OWNER/REPO>` | Target repository |

```bash
gh pr merge 99 -R acme/backend --squash --delete-branch
gh pr merge 99 -R acme/backend --merge --auto
```

### Other PR commands

```bash
# Check CI status
gh pr checks 99 -R acme/backend

# Request a review
gh pr review 99 -R acme/backend --approve
gh pr review 99 -R acme/backend --request-changes --body "Please fix the auth logic."
gh pr review 99 -R acme/backend --comment --body "Left some inline notes."

# Mark a draft as ready
gh pr ready 99 -R acme/backend

# Add a comment
gh pr comment 99 -R acme/backend --body "LGTM!"

# Close without merging
gh pr close 99 -R acme/backend

# Sync the PR branch with its base
gh pr update-branch 99 -R acme/backend

# See the diff
gh pr diff 99 -R acme/backend
```

---

## Projects (`gh project`)

GitHub Projects V2 — board/table views linked to repos or orgs.

```bash
# List projects for a user or org
gh project list --owner acme-corp
gh project list --owner @me

# View a project (number from the list output)
gh project view 1 --owner acme-corp

# List items in a project
gh project item-list 1 --owner acme-corp --limit 50
gh project item-list 1 --owner acme-corp --format json

# Add an issue or PR to a project
gh project item-add 1 --owner acme-corp --url https://github.com/acme/backend/issues/42

# Edit a project item's field value
gh project item-edit --project-id <id> --id <item-id> --field-id <field-id> --text "In Progress"

# Create a new project
gh project create --owner acme-corp --title "Q2 Roadmap"

# Link a repo to a project
gh project link 1 --owner acme-corp --repo acme/backend
```

---

## Organizations (`gh org`)

```bash
# List orgs the authenticated user belongs to
gh org list
```

---

## Direct API calls (`gh api`)

Use `gh api` when you need data not exposed by a named subcommand. The token is injected automatically.

```bash
# Get raw file content from a repo (base64 encoded)
gh api repos/acme/backend/contents/src/main.py --jq '.content' | base64 -d

# List commits on a branch
gh api repos/acme/backend/commits?sha=main&per_page=10

# Get repo topics
gh api repos/acme/backend/topics

# Paginate through all results
gh api --paginate repos/acme/backend/issues?state=open
```

---

## Common patterns

```bash
# Find all open bugs assigned to no one
gh issue list -R acme/backend --label bug --search "no:assignee" --json number,title

# Get the latest merged PR
gh pr list -R acme/backend --state merged --limit 1 --json number,title,mergedAt

# Check if a specific PR's CI is passing
gh pr checks 99 -R acme/backend

# View the diff of an open PR
gh pr diff 99 -R acme/backend

# Get all repos in an org with their language
gh repo list acme-corp --limit 100 --json name,primaryLanguage,isPrivate
```
