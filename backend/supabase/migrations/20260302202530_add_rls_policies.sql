-- Enable RLS and add ownership policies for all public tables.
-- The backend uses the secret key (service role) so these policies do not
-- affect backend queries — they protect against direct Supabase access
-- via the publishable key or authenticated Postgres connections.

-- ==========================================
-- users
-- ==========================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_row" ON public.users
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ==========================================
-- workspaces
-- ==========================================
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspaces_own_rows" ON public.workspaces
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ==========================================
-- projects
-- ==========================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_own_rows" ON public.projects
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ==========================================
-- agent_sessions
-- ==========================================
ALTER TABLE public.agent_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_sessions_own_rows" ON public.agent_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ==========================================
-- integrations
-- ==========================================
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_own_rows" ON public.integrations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ==========================================
-- slack_installations
-- ==========================================
ALTER TABLE public.slack_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_installations_own_rows" ON public.slack_installations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ==========================================
-- conversation_items
-- No direct user_id — ownership resolved through agent_sessions.
-- ==========================================
ALTER TABLE public.conversation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversation_items_own_rows" ON public.conversation_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agent_sessions s
      WHERE s.id = agent_session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agent_sessions s
      WHERE s.id = agent_session_id
        AND s.user_id = auth.uid()
    )
  );


-- ==========================================
-- slack_channels
-- No direct user_id — ownership resolved through slack_installations.
-- ==========================================
ALTER TABLE public.slack_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "slack_channels_own_rows" ON public.slack_channels
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.slack_installations si
      WHERE si.id = installation_id
        AND si.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.slack_installations si
      WHERE si.id = installation_id
        AND si.user_id = auth.uid()
    )
  );
