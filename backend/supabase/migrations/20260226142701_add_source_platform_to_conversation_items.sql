-- Add source_platform and source_channel_id to conversation_items
-- Supports cross-surface conversation history (web, Slack, and future messaging channels).
-- source_platform: identifies which surface the message originated from
-- source_channel_id: the channel/room identifier for that surface (NULL for web)
ALTER TABLE public.conversation_items
    ADD COLUMN source_platform TEXT NOT NULL DEFAULT 'web',
    ADD COLUMN source_channel_id TEXT DEFAULT NULL;
