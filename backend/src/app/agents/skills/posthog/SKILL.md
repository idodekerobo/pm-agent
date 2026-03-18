---
name: posthog
description: Query product analytics data from PostHog. Use this skill to analyze user behavior, event trends, funnels, retention, experiments, cohorts, feature flags, and saved insights. All operations are read-only.
allowed-tools: Bash(curl:*)
---

# PostHog Analytics Skill

## Auth & Conventions

### Authentication

All requests require:
- `Authorization: Bearer $POSTHOG_API_KEY`
- `Content-Type: application/json` (POST requests only)

Use `tool_bash` with `required_provider_auth='posthog'` to inject `$POSTHOG_API_KEY`, `$POSTHOG_PROJECT_ID`, and `$POSTHOG_REGION`.

**Base URL:** `https://${POSTHOG_REGION}.posthog.com` (e.g. `https://us.posthog.com`)

**All operations are read-only.** Do not attempt POST (except to `/query/`), PATCH, PUT, or DELETE requests.

### REST URL Conventions

PostHog uses standard REST resource URLs. When a user asks about a resource not explicitly documented below, construct the URL using this pattern:

```
GET  /api/projects/${POSTHOG_PROJECT_ID}/{resource}/             # list
GET  /api/projects/${POSTHOG_PROJECT_ID}/{resource}/{id}/        # detail
GET  /api/projects/${POSTHOG_PROJECT_ID}/{resource}/{id}/{sub}/  # sub-resource
POST /api/projects/${POSTHOG_PROJECT_ID}/query/                  # all analytics queries
```

**Available resources:** `insights`, `feature_flags`, `experiments`, `cohorts`

### Standard List Response Envelope

All list endpoints return:
```json
{
  "count": 1234,
  "next": "https://us.posthog.com/api/projects/1/insights/?limit=100&offset=100",
  "previous": null,
  "results": [ ... ]
}
```

Always check the `next` field — if non-null, more pages exist.

### Standard Pagination Params

All list endpoints accept:
- `limit` — results per page (default 100)
- `offset` — results to skip

### Rate Limits

- 240 requests/min, 2400/hr per project
- 3 concurrent queries, 10s max query execution time
- HogQL: default 100 rows; max 50,000 with explicit `LIMIT`

---

## How to Pick the Right Endpoint

| User Request | Endpoint | Details |
|---|---|---|
| "How many X events happened?" | `POST /query/` → `HogQLQuery` | Best for ad-hoc counts and aggregations |
| "Show me a trend for X over time" | `POST /query/` → `TrendsQuery` | Time-series with interval breakdown |
| "What's our funnel conversion X→Y?" | `POST /query/` → `FunnelsQuery` | Multi-step conversion |
| "Show me retention for users who did X" | `POST /query/` → `RetentionQuery` | Cohort-based retention by week/day |
| "What paths do users take?" | `POST /query/` → `PathsQuery` | User journey flows |
| "What events/properties exist in this project?" | `POST /query/` → `HogQLQuery` | Schema discovery (see section 1c) |
| "Show me the 'Weekly Active Users' insight" | `GET /insights/?search=Weekly+Active+Users` | Read a saved insight by name |
| "Show me all saved charts/dashboards" | `GET /insights/?saved=true` | List all saved insights |
| "What feature flags are active?" | `GET /feature_flags/?active=true` | Flag list |
| "What's the rollout % for flag X?" | `GET /feature_flags/?search=X` | Flag detail |
| "Are there any stale flags?" | `GET /feature_flags/?active=STALE` | Flags with no calls in 30+ days |
| "What experiments are running?" | `GET /experiments/?status=running` | Experiment list |
| "Show me results for experiment X" | `GET /experiments/{id}/` then `POST /query/` → `ExperimentTrendsQuery` | Fetch experiment metadata first, then query results |
| "What cohorts exist?" | `GET /cohorts/` | Cohort list |
| "Who's in cohort X?" | `GET /cohorts/{id}/persons/` | Persons in a specific cohort |
| "Analyze behavior of users in cohort X" | `POST /query/` → `HogQLQuery` using `cohort(<ID>)` | Use cohort ID in HogQL WHERE clause |

---

## 1. Analytics Queries (`POST /query/`)

The primary endpoint for all analytics data. Prefer structured query kinds (`TrendsQuery`, `FunnelsQuery`, etc.) when the user is asking a standard analytics question — they produce better-structured responses. Use `HogQLQuery` for custom aggregations and ad-hoc exploration.

**Base pattern:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{"query": {"kind": "<KIND>", ...}}'
```

**Common response fields:**
```json
{
  "results": [...],
  "hogql": "/* generated SQL */",
  "query_status": {"complete": true, "id": "abc123"},
  "timings": [...],
  "resolved_date_range": {"date_from": "2024-01-01", "date_to": "2024-01-07"}
}
```

---

### 1a. HogQLQuery (Raw SQL)

Best for: custom aggregations, cross-table queries, anything not covered by a structured query kind.

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

**HogQL response shape:**
```json
{
  "results": [ [...row values...], ... ],
  "columns": ["col1", "col2", ...],
  "types": ["UInt64", "String", ...],
  "hasMore": false,
  "limit": 100,
  "offset": 0
}
```

**HogQL table reference:**
- `events` — all captured events. Key columns: `event`, `timestamp`, `distinct_id`, `person_id`, `properties`, `elements_chain`
- `persons` — user profiles. Key columns: `id`, `distinct_ids`, `properties`, `created_at`
- `sessions` — session-level data. Key columns: `session_id`, `person_id`, `start_time`, `end_time`, `duration`
- Access event properties via `properties.<key>` (e.g. `properties.$current_url`, `properties.plan`)
- Access person properties via `person.properties.<key>` when joining

---

### 1b. Common HogQL Queries

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

**Funnel — count users who did step A then step B:**
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

**Behavior of users in a cohort:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT event, count() as cnt FROM events WHERE timestamp >= now() - INTERVAL 30 DAY AND person_id IN (SELECT id FROM persons WHERE id IN cohort(<COHORT_ID>)) GROUP BY event ORDER BY cnt DESC LIMIT 20"
    }
  }'
```

---

### 1c. Schema Discovery

Use these queries first when exploring an unfamiliar project to understand what data is available before writing deeper queries.

**List all event names (last 7 days):**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT event, count() as cnt FROM events WHERE timestamp >= now() - INTERVAL 7 DAY GROUP BY event ORDER BY cnt DESC LIMIT 100"
    }
  }'
```

**List all property keys for a specific event:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT arrayJoin(JSONExtractKeys(properties)) as property_key, count() as cnt FROM events WHERE event = '\''<EVENT_NAME>'\'' AND timestamp >= now() - INTERVAL 7 DAY GROUP BY property_key ORDER BY cnt DESC LIMIT 50"
    }
  }'
```

**List distinct values for a specific property:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "HogQLQuery",
      "query": "SELECT properties.<PROPERTY_KEY> as value, count() as cnt FROM events WHERE event = '\''<EVENT_NAME>'\'' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY value ORDER BY cnt DESC LIMIT 30"
    }
  }'
```

---

### 1d. TrendsQuery

Best for: time-series charts, comparing a metric over time, breakdowns by property.

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

**Key fields:**
- `series[]` — array of `{"kind": "EventsNode", "event": "<name>"}` (supports multiple series)
- `dateRange` — `{"date_from": "-7d" | "-30d" | "YYYY-MM-DD", "date_to": null | "YYYY-MM-DD"}`
- `interval` — `"hour"`, `"day"`, `"week"`, `"month"`
- `breakdownFilter` — `{"breakdown": "$browser", "breakdown_type": "event"}` (optional, splits results by property)
- `filterTestAccounts` — `true` to exclude internal/test traffic

**Response:** `results` is a list of series objects, each with `data` (array of counts), `labels` (array of date strings), `days`, and `label`.

---

### 1e. FunnelsQuery

Best for: multi-step conversion analysis.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "FunnelsQuery",
      "series": [
        {"kind": "EventsNode", "event": "<STEP_A>"},
        {"kind": "EventsNode", "event": "<STEP_B>"},
        {"kind": "EventsNode", "event": "<STEP_C>"}
      ],
      "dateRange": {"date_from": "-30d"}
    }
  }'
```

**Key fields:**
- `series[]` — ordered steps; each is `{"kind": "EventsNode", "event": "<name>"}`
- `funnelsFilter.funnelVizType` — `"steps"` (default), `"time_to_convert"`, `"trends"`
- `breakdownFilter` — optional property breakdown

**Response:** `results` is a list of step objects, each with `name`, `count`, `conversion_rate`, `average_conversion_time`.

---

### 1f. RetentionQuery

Best for: measuring how many users returned after performing an initial event.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "RetentionQuery",
      "retentionFilter": {
        "targetEntity": {"id": "<SEED_EVENT>", "type": "events"},
        "returningEntity": {"id": "<RETURN_EVENT>", "type": "events"},
        "retentionType": "retention_first_time",
        "period": "Week",
        "totalIntervals": 8
      },
      "dateRange": {"date_from": "-8w"}
    }
  }'
```

**Key fields:**
- `retentionType` — `"retention_first_time"` (users who did seed event for the first time) or `"retention_recurring"`
- `period` — `"Hour"`, `"Day"`, `"Week"`, `"Month"`
- `totalIntervals` — number of time periods to show

**Response:** `results` is an array of cohort rows, each with `date`, `label`, and `values` (array of `{count, people, index}` per interval).

---

### 1g. PathsQuery

Best for: understanding the user journeys between pages or events.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "PathsQuery",
      "pathsFilter": {
        "includeEventTypes": ["$pageview"],
        "startPoint": "/home",
        "endPoint": "/checkout"
      },
      "dateRange": {"date_from": "-7d"}
    }
  }'
```

**Key fields:**
- `includeEventTypes` — `["$pageview"]`, `["$autocapture"]`, or `["custom_event"]`
- `startPoint` — filter to paths starting at this page/event (optional)
- `endPoint` — filter to paths ending at this page/event (optional)

---

### 1h. Experiment Results (ExperimentTrendsQuery / ExperimentFunnelsQuery)

Experiment results are obtained via the query endpoint — there is no separate REST results action. First fetch the experiment metadata to get its `start_date` and `metrics[]`, then submit the appropriate query.

**Step 1 — Get experiment metadata:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/experiments/<EXPERIMENT_ID>/"
```
Note the `start_date` and `metrics[0].kind` from the response.

**Step 2a — Query trend-based experiment results:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "ExperimentTrendsQuery",
      "experiment_id": <EXPERIMENT_ID>,
      "count_query": {
        "kind": "TrendsQuery",
        "series": [{"kind": "EventsNode", "event": "<GOAL_EVENT>"}],
        "dateRange": {"date_from": "<EXPERIMENT_START_DATE>"}
      },
      "exposure_query": {
        "kind": "TrendsQuery",
        "series": [{"kind": "EventsNode", "event": "$feature_flag_called"}],
        "dateRange": {"date_from": "<EXPERIMENT_START_DATE>"}
      }
    }
  }'
```

**Step 2b — Query funnel-based experiment results:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{
    "query": {
      "kind": "ExperimentFunnelsQuery",
      "experiment_id": <EXPERIMENT_ID>,
      "funnels_query": {
        "kind": "FunnelsQuery",
        "series": [
          {"kind": "EventsNode", "event": "<STEP_A>"},
          {"kind": "EventsNode", "event": "<STEP_B>"}
        ],
        "dateRange": {"date_from": "<EXPERIMENT_START_DATE>"}
      }
    }
  }'
```

**Results response fields:**
- `probability` — `{"control": 0.12, "test": 0.88}` — Bayesian win probability per variant
- `significant` — `true` / `false`
- `significance_code` — `"significant"`, `"not_enough_exposure"`, `"low_win_probability"`, etc.
- `p_value` — frequentist p-value
- `credible_intervals` — `{"control": [low, high], "test": [low, high]}`
- `variants` — per-variant counts (`count`, `exposure`, `absolute_exposure` for trends; `success_count`, `failure_count` for funnels)

---

### 1i. Async Queries (for heavy queries)

For queries that may timeout (>10s), submit async and poll for the result.

```bash
# Step 1: Submit async
curl -s -X POST \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  -H "Content-Type: application/json" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/" \
  -d '{"query": {...}, "refresh": "async"}'
# Response: HTTP 202, body contains query_status.id and complete: false

# Step 2: Poll until complete (HTTP 200 = done, HTTP 202 = still running)
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/query/<QUERY_STATUS_ID>/"
```

---

## 2. Saved Insights (`GET /insights/`)

Use when the user references a specific named chart or wants to see existing analyses — don't re-query raw data when a saved insight already has the result.

**List saved insights:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/insights/?saved=true&limit=50"
```

**Search by name:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/insights/?search=Weekly+Active+Users"
```

**Filter by insight type:**
```bash
# Types: TRENDS, FUNNELS, RETENTION, PATHS, STICKINESS, LIFECYCLE, SQL
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/insights/?insight=FUNNELS&saved=true"
```

**Get a single insight by ID (includes pre-computed result):**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/insights/<ID>/"
```

**Force refresh a stale insight:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/insights/<ID>/?refresh=blocking"
```

**Key query params:** `search`, `saved` (`true`/`false`), `insight` (type filter), `limit`, `offset`, `order` (`-last_modified_at`, `last_viewed_at`, `-last_viewed_at`), `tags`, `created_by`, `feature_flag`, `favorited`, `date_from`, `date_to`

**Key response fields:**
- `id`, `short_id`, `name` — identity
- `result` — pre-computed result data (same shape as query endpoint `results`); may be `null` if stale — use `?refresh=blocking` to force recalculation
- `query` — the query definition stored with this insight
- `last_refresh`, `is_cached` — freshness metadata
- `dashboards` — list of dashboard IDs this insight appears on
- `tags`, `favorited`, `saved`, `description`

---

## 3. Feature Flags (`GET /feature_flags/`)

**List all flags:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/"
```

**Filter flags:**
```bash
# Active flags only
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?active=true"

# Stale flags (no calls in 30+ days)
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?active=STALE"

# Multivariant (A/B test) flags only
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?type=multivariant"

# Search by key or name
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/?search=checkout"
```

**Key query params:** `search`, `active` (`true`/`false`/`STALE`), `type` (`boolean`/`multivariant`/`experiment`/`remote_config`), `created_by_id`, `tags`, `order`

**Get a single flag by ID:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/feature_flags/<FLAG_ID>/"
```

**Key response fields:**
- `key` — flag identifier used in code
- `name` — human-readable description
- `active` — whether the flag is enabled
- `status` — `"active"`, `"disabled"`, `"stale"` (no calls in 30+ days)
- `filters.groups[]` — rollout rules: each has `properties[]`, `rollout_percentage`, `variant`
- `filters.multivariate.variants[]` — A/B variant definitions: `key`, `rollout_percentage`, `name`
- `filters.payloads` — JSON payloads keyed by variant key (e.g. `{"test": {"color": "blue"}}`)
- `experiment_set` — IDs of experiments using this flag
- `last_called_at` — last time the flag was evaluated in production

**Note:** Feature flags require a `Feature Flag Read` scope on the API key, separate from query scope. If you get a 403, the key may be missing that scope.

---

## 4. Experiments (`GET /experiments/`)

**List experiments:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/experiments/"
```

**Filter by status:**
```bash
# status: draft | running | stopped
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/experiments/?status=running"
```

**Key query params:** `status` (`draft`/`running`/`stopped`), `search`, `archived` (`true`/`false`), `feature_flag_id`, `created_by_id`, `order` (`-created_at`, `duration`, `status`)

**Get a single experiment:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/experiments/<ID>/"
```

**Key response fields:**
- `id`, `name`, `description`, `status`
- `start_date`, `end_date`
- `feature_flag_key` — the PostHog flag used to split users into variants
- `parameters.feature_flag_variants[]` — variant definitions: `key`, `rollout_percentage`
- `metrics[]` — metric definitions (each has a `kind`: `ExperimentTrendsQuery` or `ExperimentFunnelsQuery`)
- `conclusion`, `conclusion_comment` — set when experiment is stopped with a declared winner
- `archived` — whether the experiment has been archived

**To get statistical results:** Use `POST /query/` with `ExperimentTrendsQuery` or `ExperimentFunnelsQuery` as documented in section 1h. There is no `GET /experiments/{id}/results/` endpoint.

---

## 5. Cohorts (`GET /cohorts/`)

**List cohorts:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/cohorts/"
```

**Filter cohorts:**
```bash
# Static cohorts only (manually managed)
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/cohorts/?type=static"

# Search by name
curl -s -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/cohorts/?search=power+users"
```

**Key query params:** `search`, `type` (`static`/`dynamic`), `created_by_id`, `hide_behavioral_cohorts`

**Get a single cohort:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/cohorts/<ID>/"
```

**Key response fields:**
- `id`, `name`, `description`
- `count` — number of persons currently in the cohort
- `is_static` — `true` = manually managed; `false` = auto-calculated from rules
- `cohort_type` — `"behavioral"` or `"static"`
- `is_calculating` — `true` if cohort membership is being recalculated right now
- `last_calculation` — timestamp of last membership refresh
- `filters.properties` — rule definition for dynamic cohorts
- `experiment_set` — IDs of experiments using this cohort as an exposure filter

**Get persons in a cohort:**
```bash
curl -s \
  -H "Authorization: Bearer $POSTHOG_API_KEY" \
  "https://${POSTHOG_REGION}.posthog.com/api/projects/${POSTHOG_PROJECT_ID}/cohorts/<ID>/persons/?limit=100"
```

**Use a cohort inside HogQL queries** with `cohort(<ID>)`:
```sql
SELECT event, count() as cnt
FROM events
WHERE timestamp >= now() - INTERVAL 30 DAY
  AND person_id IN (SELECT id FROM persons WHERE id IN cohort(<COHORT_ID>))
GROUP BY event
ORDER BY cnt DESC
LIMIT 20
```

---

## 6. Pagination

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

## 7. Parsing Responses

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

**Properties are case-sensitive.** `properties.$browser` and `properties.$Browser` are different keys. Use schema discovery queries (section 1c) to find the exact key names.

**`distinct_id` vs `person_id`.** One person can have multiple `distinct_id`s (anonymous + identified). Use `person_id` for unique user counts to avoid double-counting.

**Query timeout.** Complex queries over large datasets can hit the 10s limit. Add a `WHERE timestamp >= now() - INTERVAL N DAY` clause to limit the scan window. If the query still times out, switch to `"refresh": "async"` (section 1i) and poll for the result.

**Experiment results require a query, not a GET.** There is no `GET /experiments/{id}/results/` endpoint. Results must be fetched via `POST /query/` with `ExperimentTrendsQuery` or `ExperimentFunnelsQuery` (section 1h).

**Insights `result` field may be null.** On async refresh or for uncached insights, `result` may be `null` with `query_status.complete: false`. Add `?refresh=blocking` to the GET request to force recalculation before reading.

**Feature flag API key scope.** The feature flags endpoint requires `Feature Flag Read` scope, separate from the `Query Read` scope needed for `/query/`. A 403 on `/feature_flags/` means the key is missing that scope.

**POSTHOG_REGION matters.** EU-hosted projects use `eu.posthog.com`. US-hosted use `us.posthog.com`. The wrong region returns 404 or auth errors.
