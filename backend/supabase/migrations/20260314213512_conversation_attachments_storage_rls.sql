-- RLS policies for conversation-attachments storage bucket.
-- Reads are unrestricted (public bucket) so the LLM can fetch image URLs directly.
-- Writes are scoped to the authenticated user's own folder: {user_id}/...

CREATE POLICY "Users can upload their own attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'conversation-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'conversation-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'conversation-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
