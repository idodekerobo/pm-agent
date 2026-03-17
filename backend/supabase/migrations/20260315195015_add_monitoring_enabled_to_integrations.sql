-- Add monitoring_enabled flag to integrations table
ALTER TABLE public.integrations
    ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE;
