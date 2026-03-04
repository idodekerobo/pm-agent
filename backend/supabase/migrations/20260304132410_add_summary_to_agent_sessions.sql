-- Add session summary columns to agent_sessions.
--
-- summary:         Generated summary of the session. NULL means not yet summarized.
-- last_summary_at: When the summary was last written. Used by the cron sweeper to detect
--                  sessions that have received new messages since the last summary.

ALTER TABLE public.agent_sessions
    ADD COLUMN summary TEXT,
    ADD COLUMN last_summary_at TIMESTAMPTZ;
