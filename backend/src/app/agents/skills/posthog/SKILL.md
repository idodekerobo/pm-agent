---
name: posthog
description: Query product analytics data from PostHog. Use this skill to analyze user behavior, event trends, funnels, retention, and feature flag rollouts. All operations are read-only.
allowed-tools: Bash(curl:*)
---

# PostHog Analytics Skill

## Auth & Conventions

All requests require:
- `Authorization: Bearer $POSTHOG_API_KEY`
- `Content-Type: application/json`

Use `tool_bash` with `required_provider_auth='posthog'` to inject `$POSTHOG_API_KEY`, `$POSTHOG_PROJECT_ID`, and `$POSTHOG_REGION`.

**Base URL:** `https://${POSTHOG_REGION}.posthog.com` (e.g. `https://us.posthog.com`)

**All operations are read-only.** Do not attempt POST (except to `/query/`), PATCH, PUT, or DELETE requests.

**Rate limits (per project):**
- 240 requests/min, 2400/hr
- 3 concurrent queries, 10s max execution time
- Default 100 rows returned; max 50,000 with explicit `LIMIT`

---

## 1. Analytics Queries (HogQL)

The primary query endpoint. Use `HogQLQuery` kind with PostHog's SQL dialect to query events, persons, and sessions.

**Base query pattern:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "<SQL HERE>"
    }
  }'
```

Response shape:
```json
{
  "results": [ [...row values...], ... ],
  "columns": ["col1", "col2", ...],
  "is_cached": false
}
```

---

### Common HogQL Queries

**Event counts over last 30 days (by event name):**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT event, count() as cnt FROM events WHERE timestamp >= now() - INTERVAL 30 DAY GROUP BY event ORDER BY cnt DESC LIMIT 20"
    }
  }'
```

**Unique users per day (last 14 days):**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT toDate(timestamp) as day, count(distinct person_id) as unique_users FROM events WHERE timestamp >= now() - INTERVAL 14 DAY GROUP BY day ORDER BY day ASC"
    }
  }'
```

**Top events for a specific user:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT event, count() as cnt FROM events WHERE distinct_id = '\''<DISTINCT_ID>'\'' GROUP BY event ORDER BY cnt DESC LIMIT 20"
    }
  }'
```

**Funnel — count users who did step A then step B (same session, ordered):**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT countIf(step1 = 1) as reached_step1, countIf(step2 = 1) as reached_step2, round(countIf(step2=1) / countIf(step1=1) * 100, 1) as conversion_pct FROM (SELECT person_id, maxIf(1, event = '\''<STEP_A_EVENT>'\'') as step1, maxIf(1, event = '\''<STEP_B_EVENT>'\'') as step2 FROM events WHERE timestamp >= now() - INTERVAL 30 DAY GROUP BY person_id)"
    }
  }'
```

**Retention — users who returned within 7 days of first event:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT week, count(distinct returning_user) as retained_users FROM (SELECT e2.person_id as returning_user, toStartOfWeek(e1.timestamp) as week FROM events e1 JOIN events e2 ON e1.person_id = e2.person_id WHERE e1.event = '\''<SEED_EVENT>'\'' AND e2.event = '\''<RETURN_EVENT>'\'' AND e2.timestamp > e1.timestamp AND e2.timestamp <= e1.timestamp + INTERVAL 7 DAY AND e1.timestamp >= now() - INTERVAL 90 DAY) GROUP BY week ORDER BY week"
    }
  }'
```

**User properties — list distinct values for a property:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT properties.$browser as browser, count(distinct person_id) as users FROM events WHERE timestamp >= now() - INTERVAL 30 DAY GROUP BY browser ORDER BY users DESC LIMIT 10"
    }
  }'
```

**HogQL table reference:**
- `events` — all captured events. Key columns: `event`, `timestamp`, `distinct_id`, `person_id`, `properties`, `elements_chain`
- `persons` — user profiles. Key columns: `id`, `distinct_ids`, `properties`, `created_at`
- `sessions` — session-level data. Key columns: `session_id`, `person_id`, `start_time`, `end_time`, `duration`
- Access event properties via `properties.<key>` (e.g. `properties.$current_url`, `properties.plan`)
- Access person properties via `person.properties.<key>` when joining

---

## 2. Feature Flags

List all feature flags and their rollout configuration.

```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/"
```

Response includes per-flag:
- `key` — the flag identifier used in code
- `name` — human-readable name
- `active` — whether the flag is enabled
- `filters.groups` — rollout rules (percentage, cohort conditions)
- `filters.multivariate` — variant definitions (for A/B tests)
- `rollout_percentage` — overall rollout %

**Get a single flag by ID:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/<FLAG_ID>/"
```

---

## 3. Pagination

All list endpoints are paginated. Check `next` in the response for the next page URL.

```bash
# First page
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?limit=100"

# If response has "next": "<url>", fetch it directly
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "<next_url>"
```

---

## 4. Parsing Responses

Use Python to parse and format query results for readability:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{"query": {"kind": "HogQLQuery", "query": "SELECT event, count() as cnt FROM events WHERE timestamp >= now() - INTERVAL 7 DAY GROUP BY event ORDER BY cnt DESC LIMIT 10"}}' \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
cols = data.get('columns', [])
print('\t'.join(cols))
for row in data.get('results', []):
    print('\t'.join(str(v) for v in row))
"
```

---

## Known Gotchas

**String quoting in shell.** Single quotes inside `-d '...'` must be escaped as `'\''`. When building dynamic queries, prefer writing the JSON to a temp file and passing `-d @/tmp/query.json` to avoid quoting issues.

**Properties are nullable.** `properties.<key>` returns `null` if the property wasn't set on that event. Use `isNotNull(properties.<key>)` in WHERE clauses to filter.

**`distinct_id` vs `person_id`.** One person can have multiple `distinct_id`s (anonymous + identified). Use `person_id` for unique user counts to avoid double-counting.

**Query timeout.** Complex queries over large datasets can hit the 10s limit. Add a `WHERE timestamp >= now() - INTERVAL N DAY` clause to limit the scan window.

**Feature flag scopes.** The feature flags endpoint requires a separate API key scope (`Feature Flag Read`) from the query endpoint (`Query Read`). If you get a 403 on `/feature_flags/`, the user's key may be missing that scope.
