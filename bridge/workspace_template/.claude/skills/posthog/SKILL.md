---
name: posthog
description: >
  Query product analytics data from PostHog. Use when analyzing user behavior,
  event trends, funnels, retention, feature flags, or experiments. Read-only —
  never attempts writes except to the /query/ endpoint.
allowed-tools: Bash(curl:*)
---

# PostHog Analytics Skill

## Authentication

All requests require:
- `Authorization: Bearer $POSTHOG_API_KEY`
- `Content-Type: application/json` (POST requests only)

Three env vars are pre-injected: `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_REGION`.

**Base URL:** `https://${POSTHOG_REGION}.posthog.com`

**All operations are read-only.** Only POST to `/query/` is permitted. No PATCH, PUT, or DELETE.

---

## How to Pick the Right Endpoint

| User Request | Use |
|---|---|
| "How many X events happened?" | `POST /query/` → `HogQLQuery` |
| "Show me a trend for X over time" | `POST /query/` → `TrendsQuery` |
| "What's our funnel conversion X→Y?" | `POST /query/` → `FunnelsQuery` |
| "What's our retention for X?" | `POST /query/` → `RetentionQuery` |
| "What feature flags are active?" | `GET /feature_flags/?active=true` |
| "What experiments are running?" | `GET /experiments/?status=running` |
| "Show me a saved insight by name" | `GET /insights/?search=Weekly+Active+Users` |

---

## 1. Analytics Queries (`POST /query/`)

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{"query": {"kind": "HogQLQuery", "query": "SELECT event, count() as cnt FROM events WHERE timestamp >= now() - INTERVAL 7 DAY GROUP BY event ORDER BY cnt DESC LIMIT 20"}}'
```

### Schema discovery (start here on an unfamiliar project)

```bash
# List all event names in last 7 days
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{"query": {"kind": "HogQLQuery", "query": "SELECT event, count() as cnt FROM events WHERE timestamp >= now() - INTERVAL 7 DAY GROUP BY event ORDER BY cnt DESC LIMIT 100"}}'
```

### Common HogQL queries

```bash
# Unique users per day
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{"query": {"kind": "HogQLQuery", "query": "SELECT toDate(timestamp) as day, count(distinct person_id) as unique_users FROM events WHERE timestamp >= now() - INTERVAL 14 DAY GROUP BY day ORDER BY day ASC"}}'
```

**Parse with python3:**

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{"query": {"kind": "HogQLQuery", "query": "..."}}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
cols = data.get('columns', [])
print('\t'.join(cols))
for row in data.get('results', []):
    print('\t'.join(str(v) for v in row))
"
```

### TrendsQuery (time series)

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "TrendsQuery",
      "series": [{"kind": "EventsNode", "event": "$pageview"}],
      "dateRange": {"date_from": "-7d"},
      "interval": "day"
    }
  }'
```

### FunnelsQuery (conversion)

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "FunnelsQuery",
      "series": [
        {"kind": "EventsNode", "event": "signup"},
        {"kind": "EventsNode", "event": "first_action"},
        {"kind": "EventsNode", "event": "paid"}
      ],
      "dateRange": {"date_from": "-30d"}
    }
  }'
```

---

## 2. Feature Flags

```bash
# Active flags
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?active=true"

# Search by name
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?search=checkout"

# Stale flags (no calls in 30+ days)
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?active=STALE"
```

---

## 3. Experiments

```bash
# Running experiments
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/experiments/?status=running"

# Get a single experiment
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/experiments/{ID}/"
```

**To get statistical results:** Use `POST /query/` with `ExperimentTrendsQuery` or `ExperimentFunnelsQuery`. There is no `GET /experiments/{id}/results/` endpoint.

---

## 4. Saved Insights

```bash
# Search by name
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/insights/?search=Weekly+Active+Users"

# List all saved insights
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/insights/?saved=true&limit=50"
```

---

## Known Gotchas

- **`distinct_id` vs `person_id`.** Use `person_id` for unique user counts — one person can have multiple `distinct_id`s.
- **Properties are nullable and case-sensitive.** `properties.$browser` ≠ `properties.$Browser`.
- **Query timeout.** Add `WHERE timestamp >= now() - INTERVAL N DAY` to limit scan. For heavy queries use `"refresh": "async"`.
- **POSTHOG_REGION matters.** EU projects use `eu.posthog.com`, US use `us.posthog.com`.
- **Feature flag scope.** The `/feature_flags/` endpoint requires `Feature Flag Read` scope, separate from query scope. A 403 means the key is missing it.
