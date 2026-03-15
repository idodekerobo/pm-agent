/**
 * PostHog event name constants for the web app.
 *
 * Always import from here instead of writing raw strings.
 * Typos become compile errors, renames are a one-line change.
 */
export const EVENTS = {
  // Onboarding funnel
  ONBOARDING_STARTED: 'onboarding_started',
  ONBOARDING_STEP_COMPLETED: 'onboarding_step_completed',
  ONBOARDING_COMPANY_SCRAPED: 'onboarding_company_scraped',
  ONBOARDING_FOCUS_SELECTED: 'onboarding_focus_selected',
  ONBOARDING_ACTIVITY_SELECTED: 'onboarding_activity_selected',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  ONBOARDING_SKIPPED_INTEGRATIONS: 'onboarding_skipped_integrations',

  // Integrations
  INTEGRATION_CONNECT_CLICKED: 'integration_connect_clicked',
  INTEGRATION_CONNECTED: 'integration_connected',
  INTEGRATION_DISCONNECTED: 'integration_disconnected',

  // Agent runs
  AGENT_RUN_STARTED: 'agent_run_started',
  AGENT_RUN_COMPLETED: 'agent_run_completed',
  AGENT_RUN_FAILED: 'agent_run_failed',

  // Billing / upgrade
  UPGRADE_PROMPTED: 'upgrade_prompted',
  UPGRADE_CLICKED: 'upgrade_clicked',

  // Sessions
  SESSION_CREATED: 'session_created',
  SESSION_OPENED: 'session_opened',
  SESSION_RENAMED: 'session_renamed',
  SESSION_PINNED: 'session_pinned',
  SESSION_UNPINNED: 'session_unpinned',
  SESSION_DELETED: 'session_deleted',

  // Settings
  SETTINGS_TAB_VIEWED: 'settings_tab_viewed',

  // Chat empty state
  EMPTY_STATE_PROMPT_CLICKED: 'empty_state_prompt_clicked',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
