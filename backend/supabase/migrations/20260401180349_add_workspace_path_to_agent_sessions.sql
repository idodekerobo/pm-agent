-- Add workspace_path to agent_sessions.
--
-- workspace_path: the local filesystem directory the user chose for the session.
-- Used by the bridge to set the Claude Code subprocess cwd, which determines
-- the Claude Code project directory (and therefore which sessions are resumable).
-- Null means use the bridge's default startup workspace.

ALTER TABLE agent_sessions ADD COLUMN workspace_path TEXT;
