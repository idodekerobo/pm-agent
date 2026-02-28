-- Add llm_input_context to conversation_items.
-- Stores the full input_items list passed to the orchestrator for a given user turn.
-- Only populated for surfaces that inject extra context before the user message
-- (e.g. Slack: slack_context_item + channel history + user message).
-- NULL for web sessions where history items are already individually persisted in the DB.
ALTER TABLE public.conversation_items
    ADD COLUMN llm_input_context JSONB DEFAULT NULL;
