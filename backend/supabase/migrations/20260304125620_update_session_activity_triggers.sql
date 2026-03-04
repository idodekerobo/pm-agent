-- Fix trigger semantics for agent_sessions.
--
-- Previously, updated_at was bumped by a trigger on conversation_items inserts.
-- That is non-standard — updated_at should only change when the agent_sessions
-- row itself is modified. This migration:
--   1. Drops the old misplaced trigger and its function.
--   2. Creates a new trigger on conversation_items that will bump last_message_at
--      (column added in the next migration).
--   3. Adds a standard BEFORE UPDATE trigger on agent_sessions so updated_at
--      behaves conventionally.

-- 1. Drop old trigger + function
DROP TRIGGER IF EXISTS trg_bump_session_updated_at ON public.conversation_items;
DROP FUNCTION IF EXISTS bump_agent_session_updated_at();

-- 2. New trigger: bump last_message_at on every conversation_items INSERT
--    (column last_message_at is added in migration 20260304125832_add_last_message_at_to_agent_sessions)
CREATE OR REPLACE FUNCTION bump_session_last_message_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.agent_sessions SET last_message_at = NOW() WHERE id = NEW.agent_session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bump_session_last_message_at
AFTER INSERT ON public.conversation_items
FOR EACH ROW EXECUTE FUNCTION bump_session_last_message_at();

-- 3. Standard updated_at trigger on agent_sessions itself
CREATE OR REPLACE FUNCTION set_agent_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_agent_sessions_updated_at
BEFORE UPDATE ON public.agent_sessions
FOR EACH ROW EXECUTE FUNCTION set_agent_sessions_updated_at();
