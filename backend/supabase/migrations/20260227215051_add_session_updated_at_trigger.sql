-- Trigger: automatically bump agent_sessions.updated_at whenever a conversation_items
-- row is inserted. This keeps updated_at accurate across all surfaces (web, Slack, etc.)
-- without requiring application-level bookkeeping. Also enables the 36-hour DM
-- session time-window lookup in find_session_by_thread_id.
CREATE OR REPLACE FUNCTION bump_agent_session_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.agent_sessions SET updated_at = NOW() WHERE id = NEW.agent_session_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bump_session_updated_at
AFTER INSERT ON public.conversation_items
FOR EACH ROW EXECUTE FUNCTION bump_agent_session_updated_at();
