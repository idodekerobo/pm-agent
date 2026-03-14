-- Add pinned session, initiated_by, and unread tracking to agent_sessions.
--
-- is_pinned:    surfaces the session at the top of the sidebar (welcome session)
-- initiated_by: distinguishes agent-initiated sessions from user-initiated ones
-- last_read_at: tracks when the user last opened the session; used to compute
--               unread state client-side (last_message_at > last_read_at)

ALTER TABLE public.agent_sessions
  ADD COLUMN is_pinned    BOOLEAN   NOT NULL DEFAULT FALSE,
  ADD COLUMN initiated_by TEXT      NOT NULL DEFAULT 'user'
    CHECK (initiated_by IN ('user', 'agent')),
  ADD COLUMN last_read_at TIMESTAMPTZ;
