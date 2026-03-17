-- Adding last_synthesized_at to integrations table for background updates synthesis runs
ALTER TABLE integrations
  ADD COLUMN last_synthesized_at TIMESTAMPTZ NULL;
