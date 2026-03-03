-- Track whether the PM agent is actively processing a request.
-- Separate from sandbox_status (sandbox lifecycle) — a sandbox can be alive/idle with no run in flight.
ALTER TABLE public.workspaces
    ADD COLUMN IF NOT EXISTS agent_run_status TEXT NOT NULL DEFAULT 'idle';
