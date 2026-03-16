-- Add enable_agent_monitoring flag to users table
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS enable_agent_monitoring BOOLEAN NOT NULL DEFAULT TRUE;
