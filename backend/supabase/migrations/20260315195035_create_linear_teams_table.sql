-- Stores one row per Linear team the agent has access to within a workspace.
-- Analogous to slack_channels: team-level config with a per-team monitoring toggle.
-- Seeded at OAuth callback time via the Linear API; re-synced on demand.
CREATE TABLE IF NOT EXISTS public.linear_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL,

    linear_team_id TEXT NOT NULL,
    team_name TEXT,
    team_key TEXT,  -- Linear's short identifier, e.g. "ENG"

    monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT linear_teams_installation_id_fkey
        FOREIGN KEY (installation_id) REFERENCES public.linear_installations(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT linear_teams_unique_installation_team
        UNIQUE (installation_id, linear_team_id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_linear_teams_installation_id
    ON public.linear_teams(installation_id);


-- ==========================================
-- RLS
-- No direct user_id — ownership resolved through linear_installations.
-- ==========================================
ALTER TABLE public.linear_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "linear_teams_own_rows" ON public.linear_teams
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.linear_installations li
      WHERE li.id = installation_id
        AND li.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.linear_installations li
      WHERE li.id = installation_id
        AND li.user_id = auth.uid()
    )
  );
