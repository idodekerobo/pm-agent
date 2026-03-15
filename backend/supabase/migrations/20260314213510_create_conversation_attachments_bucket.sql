-- Create public storage bucket for conversation image attachments.
-- Reads are open (public bucket) so URLs can be passed directly to the LLM.
-- Write access is controlled by RLS policies in the companion migration.
INSERT INTO storage.buckets (id, name, public)
VALUES ('conversation-attachments', 'conversation-attachments', true)
ON CONFLICT DO NOTHING;
