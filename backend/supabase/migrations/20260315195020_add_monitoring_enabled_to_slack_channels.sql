-- Add monitoring_enabled flag to slack_channels table
ALTER TABLE public.slack_channels
    ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT TRUE;
