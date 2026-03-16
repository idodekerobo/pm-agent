-- Stores one row per Linear workspace a user has connected.
-- Analogous to slack_installations: workspace-level metadata that linear_teams hangs off of.
CREATE TABLE IF NOT EXISTS public.linear_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,

    linear_workspace_id TEXT NOT NULL,
    linear_workspace_name TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT linear_installations_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT linear_installations_unique_user_workspace
        UNIQUE (user_id, linear_workspace_id)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_linear_installations_user_id
    ON public.linear_installations(user_id);


-- ==========================================
-- RLS
-- ==========================================
ALTER TABLE public.linear_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "linear_installations_own_rows" ON public.linear_installations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
