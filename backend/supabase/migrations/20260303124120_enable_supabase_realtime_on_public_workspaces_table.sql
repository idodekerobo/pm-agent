-- Enable Supabase Realtime on workspaces so the frontend can subscribe to live status changes.
ALTER PUBLICATION supabase_realtime ADD TABLE public.workspaces;
