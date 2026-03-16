-- Stores per-repo monitoring toggle state as a JSONB map.
-- Key = GitHub full_name (e.g. "acmecorp/backend"), value = monitoring enabled boolean.
-- Populated at GitHub App install time and kept fresh via installation_repositories webhook events.
ALTER TABLE public.github_installations
    ADD COLUMN IF NOT EXISTS repo_monitoring_config JSONB NOT NULL DEFAULT '{}';
