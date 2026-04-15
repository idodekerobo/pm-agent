---
name: github
description: >
  Read and manage GitHub repositories, issues, pull requests, projects, and more.
  Use when looking up repos, finding open issues, reading PRs, checking CI status,
  creating issues, or any GitHub operation.
allowed-tools: Bash(gh:*)
---

# GitHub CLI (gh)

## Authentication

`GITHUB_TOKEN` is pre-injected into the environment. The `gh` CLI picks it up automatically. Never run `gh auth login` or `gh auth setup-git`.

---

## Core Concepts

### Specifying a repository

Every command accepts `-R <OWNER/REPO>` to target a specific repository:

```bash
gh issue list -R acme/backend
gh pr view 42 -R acme/backend
```

### Output formatting

```bash
# JSON output with specific fields
gh pr list -R acme/backend --json number,title

# Filter JSON with jq
gh pr view 42 -R acme/backend --json state --jq '.state'
```

---

## Issues

```bash
# List open issues
gh issue list -R acme/backend --state open

# Filter by assignee, label
gh issue list -R acme/backend --assignee @me --label bug

# Search
gh issue list -R acme/backend --search "memory leak sort:created-desc" --limit 10

# View issue with comments
gh issue view 42 -R acme/backend --comments

# Create an issue
gh issue create -R acme/backend \
  --title "Auth token expires too quickly" \
  --body "Users report being logged out after 15 minutes." \
  --label bug --assignee @me

# Edit an issue
gh issue edit 42 -R acme/backend --add-label "priority:high"

# Close / reopen
gh issue close 42 -R acme/backend
gh issue reopen 42 -R acme/backend

# Add a comment
gh issue comment 42 -R acme/backend --body "Looking into this now."
```

---

## Pull Requests

```bash
# List open PRs
gh pr list -R acme/backend --state open

# View a PR
gh pr view 99 -R acme/backend --comments

# Create a PR
gh pr create -R acme/backend \
  --title "Add rate limiting" \
  --body "Closes #42." \
  --base main --draft --reviewer alice,bob

# Check CI status
gh pr checks 99 -R acme/backend

# Merge a PR
gh pr merge 99 -R acme/backend --squash --delete-branch

# Add a comment
gh pr comment 99 -R acme/backend --body "LGTM!"

# View diff
gh pr diff 99 -R acme/backend
```

---

## Repositories

```bash
# List repos for an org
gh repo list acme-corp --limit 100 --json name,url,isPrivate

# View a repo
gh repo view acme/backend --json name,description,defaultBranchRef

# Create a repo
gh repo create acme/new-service --private --description "New service"
```

---

## Projects

```bash
# List projects for an org
gh project list --owner acme-corp

# List items in a project
gh project item-list 1 --owner acme-corp --format json

# Add an issue to a project
gh project item-add 1 --owner acme-corp --url https://github.com/acme/backend/issues/42
```

---

## Direct API calls

```bash
# Get file content from a repo
gh api repos/acme/backend/contents/src/main.py --jq '.content' | base64 -d

# List commits on a branch
gh api repos/acme/backend/commits?sha=main\&per_page=10

# Paginate through all results
gh api --paginate repos/acme/backend/issues?state=open
```

---

## Common patterns

```bash
# Find all open bugs with no assignee
gh issue list -R acme/backend --label bug --search "no:assignee" --json number,title

# Get latest merged PR
gh pr list -R acme/backend --state merged --limit 1 --json number,title,mergedAt

# All repos in an org with language
gh repo list acme-corp --limit 100 --json name,primaryLanguage,isPrivate
```
