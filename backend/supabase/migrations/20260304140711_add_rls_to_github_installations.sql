-- Enable RLS and add ownership policy for github_installations.
-- Follows the same pattern as slack_installations — direct user_id column,
-- users can only access their own rows.

-- ==========================================
-- github_installations
-- ==========================================
ALTER TABLE public.github_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "github_installations_own_rows" ON public.github_installations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
