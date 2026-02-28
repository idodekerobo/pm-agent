-- Add session origin tracking to agent_sessions.
-- session_start_platform: identifies which surface started the session (web, slack, discord, etc.)
-- external_thread_id: platform-agnostic key for the originating thread/conversation.
--   Slack thread mentions: "{channel_id}:{thread_ts}"
--   Slack DMs:            "dm:{channel_id}"
--   Web sessions:         NULL
ALTER TABLE public.agent_sessions
    ADD COLUMN session_start_platform TEXT NOT NULL DEFAULT 'web',
    ADD COLUMN external_thread_id TEXT DEFAULT NULL;

-- Unique index for thread-based sessions (e.g. Slack @-mentions).
-- Prevents duplicate sessions if two events for the same thread arrive concurrently.
-- Excluded from DM entries (prefixed with 'dm:') since DMs intentionally create
-- a new session per time window, allowing multiple rows per channel over time.
CREATE UNIQUE INDEX idx_agent_sessions_thread_unique
ON public.agent_sessions (user_id, session_start_platform, external_thread_id)
WHERE external_thread_id IS NOT NULL AND external_thread_id NOT LIKE 'dm:%';

-- Regular (non-unique) index for DM time-window lookups.
CREATE INDEX idx_agent_sessions_external_thread
ON public.agent_sessions (user_id, session_start_platform, external_thread_id);
