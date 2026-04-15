-- Enable RLS and add ownership policy for bridge_tokens.
-- Users can only access their own token rows.

ALTER TABLE public.bridge_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bridge_tokens_own_rows" ON public.bridge_tokens
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
