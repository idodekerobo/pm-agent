-- Enable Supabase Realtime on conversation_items so the frontend can
-- subscribe to live progress updates from background workers (e.g. code tasks).
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_items;
