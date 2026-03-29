-- Add provider and execution environment tracking to agent_sessions.
--
-- execution_environment: where the agent run happened ('cloud' | 'local_bridge')
-- provider:              which AI runtime was used ('openai' | 'claude_code' | 'openai_codex')
-- provider_session_id:   opaque session ID from the provider, used to resume sessions.
--                        For claude_code + local_bridge: the claude session_id returned in
--                        the stream-json system event, passed as `--resume <id>` on subsequent turns.
--
-- Migration pattern: add NOT NULL columns with a temporary DEFAULT to backfill existing rows,
-- then DROP DEFAULT so all future INSERTs are forced to supply these values explicitly.

ALTER TABLE agent_sessions
  ADD COLUMN execution_environment TEXT NOT NULL DEFAULT 'cloud',
  ADD COLUMN provider              TEXT NOT NULL DEFAULT 'openai',
  ADD COLUMN provider_session_id   TEXT;

ALTER TABLE agent_sessions
  ALTER COLUMN execution_environment DROP DEFAULT,
  ALTER COLUMN provider              DROP DEFAULT;
