-- Table to track async coding tasks spawned by the agent

-- Safe to re-run: drops and recreates the code_tasks table from scratch.
DROP TABLE IF EXISTS public.code_tasks CASCADE;

CREATE TABLE public.code_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued'
    CONSTRAINT code_tasks_status_check
    CHECK (status IN ('queued', 'cloning', 'running', 'pushing', 'complete', 'failed')),
  repo_url TEXT NOT NULL,
  base_branch TEXT NOT NULL DEFAULT 'main',
  output_branch TEXT,
  pr_url TEXT,
  spec TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_code_tasks_user_id ON public.code_tasks (user_id);
CREATE INDEX idx_code_tasks_agent_session_id ON public.code_tasks (agent_session_id);
CREATE INDEX idx_code_tasks_status ON public.code_tasks (status);

CREATE TRIGGER trg_code_tasks_updated_at
  BEFORE UPDATE ON public.code_tasks
  FOR EACH ROW EXECUTE FUNCTION set_agent_sessions_updated_at();

-- RLS: users can only read their own rows.
-- INSERT / UPDATE / DELETE go through the service role (no policy needed for those).
ALTER TABLE public.code_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own code tasks"
  ON public.code_tasks
  FOR SELECT
  USING (auth.uid() = user_id);
