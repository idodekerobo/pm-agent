-- Add last_message_at to agent_sessions.
--
-- updated_at now tracks row-level changes only (see migration 20260304125620_update_session_activity_triggers).
-- last_message_at tracks when the session last received a conversation_items
-- insert — used for ordering sessions by recent activity and for the Slack DM
-- 36-hour session reuse window.
--
-- Backfill from updated_at: since updated_at was previously bumped on every
-- message insert, its current value is equivalent to last_message_at for all
-- existing rows.

ALTER TABLE public.agent_sessions
    ADD COLUMN last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.agent_sessions
    SET last_message_at = updated_at;

-- Index to support the DM session lookup (order + filter by last_message_at)
CREATE INDEX IF NOT EXISTS idx_agent_sessions_last_message_at
    ON public.agent_sessions(last_message_at);
