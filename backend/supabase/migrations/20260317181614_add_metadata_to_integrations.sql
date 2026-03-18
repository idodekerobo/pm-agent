-- Add a generic metadata column to integrations for provider-specific config
-- that doesn't warrant a dedicated table (e.g. project_id, region for PostHog).
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS metadata JSONB;
