CREATE TABLE errors (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  platform    TEXT NOT NULL CHECK (platform IN ('server', 'worker', 'agent', 'web_app')),
  error_type  TEXT,
  message     TEXT NOT NULL,
  stack_trace TEXT,
  context     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE errors ENABLE ROW LEVEL SECURITY;

-- Users can only read their own errors.
-- Writes always go through the service role key on the backend — no client INSERT policy needed.
CREATE POLICY "users can read own errors"
  ON errors FOR SELECT
  USING (auth.uid() = user_id);
