---
name: linear
description: >
  Manage Linear issues, teams, projects, and cycles via the Linear GraphQL API.
  Use when creating issues, updating status, finding assigned work, querying
  team backlogs, or any Linear workspace operation.
allowed-tools: Bash(curl:*)
---

# Linear API

Use the Linear GraphQL API via `curl`. The `LINEAR_API_KEY` is pre-injected into the environment.

## Authentication

All requests use `Authorization: $LINEAR_API_KEY` header:

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ viewer { id name email } }"}'
```

---

## Known Gotchas

- Always use `-s` (silent) with `curl` to suppress progress output.
- Pipe to `| python3 -m json.tool` or `| jq .` for readable output if available.
- Use heredocs for multi-line queries to avoid escaping issues.
- GraphQL variables must be passed as a JSON object in the `variables` key alongside `query`.
- IDs in Linear are UUIDs — always capture and reuse them rather than relying on names.

---

## Common Queries

### Get current user

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ viewer { id name email } }"}'
```

### List teams

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ teams { nodes { id name key } } }"}'
```

### List issues for a team

Replace `TEAM_ID` with the UUID from `teams`:

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($teamId: String!) { team(id: $teamId) { issues(orderBy: priority) { nodes { id identifier title priority state { name } assignee { name } } } } }",
    "variables": { "teamId": "TEAM_ID" }
  }'
```

### Filter issues by state

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($teamId: String!) { team(id: $teamId) { issues(filter: { state: { type: { eq: \"started\" } } }, orderBy: priority) { nodes { id identifier title assignee { name } } } } }",
    "variables": { "teamId": "TEAM_ID" }
  }'
```

Valid state types: `triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`

### View a single issue

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($id: String!) { issue(id: $id) { id identifier title description priority state { name } assignee { name } comments { nodes { body createdAt user { name } } } } }",
    "variables": { "id": "ISSUE_UUID" }
  }'
```

### Search issues by text

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($term: String!) { searchIssues(term: $term, first: 20) { nodes { identifier title state { name } assignee { name } } } }",
    "variables": { "term": "onboarding" }
  }'
```

---

## Mutations

### Create an issue

First get the team ID and desired workflow state ID, then:

```bash
# Get workflow states for a team
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query($teamId: String!) { team(id: $teamId) { states { nodes { id name type } } } }",
    "variables": { "teamId": "TEAM_ID" }
  }'

# Create the issue
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier title } } }",
    "variables": {
      "input": {
        "teamId": "TEAM_ID",
        "title": "Feature title",
        "description": "What needs to be done.",
        "priority": 2,
        "stateId": "STATE_UUID"
      }
    }
  }'
```

Priority values: `0` = No priority, `1` = Urgent, `2` = High, `3` = Medium, `4` = Low

### Update an issue

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id identifier title state { name } } } }",
    "variables": {
      "id": "ISSUE_UUID",
      "input": {
        "stateId": "STATE_UUID",
        "priority": 1
      }
    }
  }'
```

### List projects

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ projects { nodes { id name description state } } }"}'
```

---

## Multi-line Query Pattern (heredoc)

For complex queries, use a heredoc to build the JSON payload cleanly:

```bash
PAYLOAD=$(cat <<'EOF'
{
  "query": "query($teamId: String!) { team(id: $teamId) { issues(orderBy: priority, first: 50) { nodes { identifier title priority state { name } assignee { name } } } } }",
  "variables": { "teamId": "TEAM_ID" }
}
EOF
)

curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```
