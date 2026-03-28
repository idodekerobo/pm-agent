# TODOS

## Bridge / Local-First Pivot

- [ ] **Set up acme.sh auto-renewal → Railway env var update**
  — acme.sh cron on your Mac renews the cert every 60 days, but Railway env vars
  (`BRIDGE_TLS_CERT`, `BRIDGE_TLS_KEY`) won't update automatically. Fix: add a
  `--reloadcmd` hook to acme.sh that POSTs the new cert+key to the Railway API after
  renewal. Railway API endpoint: `PATCH /v1/services/{serviceId}/variables`.
  Needs a Railway API token stored in `~/.acme.sh/account.conf`.
  Do before the 90-day cert expiry (expires ~2026-06-24).
  _DevOps / Bridge infra_

- [ ] **Define Phase 1 validation exit criteria before starting bridge build**
  — Write a short doc capturing: what outcomes would stop Phase 1 (e.g., 0/3 test users
  can install bridge, Claude Code UX is materially degraded vs cloud agent, etc.). Without
  this, you'll keep building past the signal. Do this before writing the first line of bridge code.
  _Eng review 2026-03-25_

- [ ] **Migrate bridge registry from in-memory to Redis before broader rollout**
  — `bridge/registry.py` currently holds `user_id → WebSocket` in process memory. Fine for Phase 1
  (single Railway instance, 3 users). Breaks under horizontal scaling (Slack events route to wrong
  instance) and registry is lost on Railway restart (bridge reconnects in seconds, but any in-flight
  Slack event is dropped). Fix: move registry to Redis with TTL-keyed entries, same pattern as
  existing Redis/RQ setup. Do before rolling out to more users or adding Railway replicas.
  _Blocked by: Phase 1 validation passing_
  _Eng review 2026-03-25_

- [ ] **Migrate integration token delivery from env vars to MCP servers before broader rollout**
  — Phase 1 injects OAuth tokens (Linear, PostHog, GitHub, etc.) as env vars into the Claude Code
  process. These are visible via `ps eww` / `/proc/environ` and inherited by all subprocesses.
  Acceptable for 3 technical test users. Fix: ship Draft MCP servers per integration (Phase 2).
  MCP servers handle auth and don't expose tokens in process env.
  _Blocked by: MCP server build (Phase 2)_
  _Eng review 2026-03-25_

## Local-First Cleanup — Cloud UI Remnants

The app was built cloud-first and retrofitted for local. These are cloud-specific UI elements
that are currently hacked out (`!isLocal` guards or just hidden). They need proper cleanup
as part of the local-first rebuild — either removed entirely or replaced with local equivalents.

- [ ] **Billing tab in Settings** — currently shown in all modes. Should be removed from the
  sidebar nav entirely in local mode. Eventually: replace with a "Plan" tab that explains
  the open-core model (free local runtime, paid cloud features).

- [ ] **Upgrade banner in Chat** — the 402 no-credits banner (`chat/page.tsx`) fires in cloud
  mode when credits run out. Has no meaning in local mode. Should be gated with `!isLocal`
  (currently not guarded).

- [ ] **`refetchBilling()` after every agent run** — called unconditionally in the cloud run
  path's finally block (`chat/page.tsx`). Should be removed from the local run path entirely
  (already is — it's only in the cloud path). Verify this stays clean as code evolves.

- [ ] **`handleUpgrade` / `handlePortal` functions in Chat** — dead code in local mode.
  Once billing is fully removed from the local experience, these can be stripped.

- [ ] **`BillingProvider` making `/billing/status` fetch on mount** — fires unconditionally
  in `layout.tsx` for all users. In local mode this is a wasted round-trip. Either skip
  the fetch when bridge is connected, or remove `BillingProvider` from the local app
  entirely once the cloud mode is deprecated.

- [ ] **`AgentFilesTab` in Settings** — hidden via `!isLocal` guard but the component and
  its Modal Volume API calls still exist. Once cloud mode is deprecated, delete the
  component entirely (it browses the old Modal cloud workspace which won't exist locally).

- [ ] **Credits pill in ChatHeader** — currently hidden via `!isLocal`. Once cloud is
  deprecated, remove the prop, the conditional, and the `creditsRemaining` state from
  ChatHeader entirely.

- [ ] **Upgrade page (`/upgrade`)** — standalone cloud-only route. Should redirect to `/chat`
  or be removed entirely once cloud billing is gone.

- [ ] **Welcome session endpoint (`/welcome-session`)** in onboarding finish — calls the
  cloud API unconditionally. In local mode the welcome session should be created the same
  way as regular sessions (via `POST /sessions` + bridge). Not yet conditionalized.

## Local Bridge / Web App

- [ ] **Fully local integration token storage (Phase 2+)**
  — Currently, bridge fetches integration tokens from the cloud at startup via
  `GET /bridge/integration-tokens`. Fully local path: move OAuth redirect URIs to the
  bridge's local subdomain (`https://local.draftai.us:7349/auth/<provider>/callback`),
  store tokens in the OS keychain via `keyring`, handle refresh locally. Requires
  re-registering redirect URIs with every provider (Linear, GitHub, Google, Notion, Slack,
  PostHog). Only worth doing once cloud integration flows are validated and users are asking
  for air-gapped / no-cloud-dependency operation.
  _Blocked by: Phase 1 validation + provider redirect URI re-registration effort_

- [ ] **Slack relay: bridge posts directly to Slack API (Option B)**
  — Phase 1 Slack relay routes responses back to cloud via WebSocket, which posts to Slack
  using existing cloud Slack SDK logic. Option B: bridge fetches the Slack bot token from its
  in-memory integration token cache (already available at startup) and posts directly to the
  Slack API, removing the cloud round-trip for Slack responses. Simpler data path, better
  offline resilience, but adds Slack API dependency to the bridge.
  _Blocked by: Phase 1 Slack relay (C5) validation_

- [ ] **JWT expiry in local mode** — Bridge uses the Supabase JWT passed per-request
  (`jwt` field in `/run-local` body) to write `conversation_items`. Supabase JWTs expire
  after 1 hour. Claude Code runs approaching that limit will fail mid-run with a Supabase
  auth error. Fix: pass `refresh_token` to bridge alongside the JWT; bridge calls
  `POST /auth/v1/token?grant_type=refresh_token` when it gets a 401 from Supabase.
  _Deferred to Phase 2._

- [ ] **Image attachments in local mode** — Phase 1 skips image uploads in local mode
  (only text files are inlined into the prompt). Add image support: bridge accepts
  `image_urls` array, downloads from Supabase Storage, passes as base64 to Claude Code.
  _Deferred to Phase 2._

## Cloud Agent Deprecation (Local-First Completion)

- [ ] **Remove cloud RQ worker path for agent runs**
  — The cloud path (`POST /run` → Modal sandbox → RQ worker) should be deprecated for local-first
  users. When a user has the bridge connected, all runs go through the bridge. When they don't,
  show a gate: "Install the local bridge to run your agent" or "Upgrade to the Cloud Plan for
  hosted runs." The Modal sandbox, `modal_sandbox.py`, and `run.py`'s cloud branch can be removed
  or feature-flagged out once the local-first path is validated. Slack events should follow the
  same gate — no bridge connected → "Connect your local bridge at draftai.us/settings to run
  your agent from Slack."
  _Blocked by: Phase 1 validation passing + Cloud Plan pricing decision_

## GitHub Integration
- [ ] Add webhook endpoint — `POST /integrations/github/webhook` for receiving GitHub events
  (push, PR merge, etc). Needs `X-Hub-Signature-256` verification. Route `installation_id`
  → `user_id` via `github_installations` table.

## Coding Agent
- [ ] End-to-end test the coding agent flow: connect → install app → callback → tokens stored
  → tool_bash with GITHUB_TOKEN → skill provisioned

## Billing
- [ ] Admin plan migration (post Phase 5)
- [ ] Add upgrade link to Slack no-credits message
