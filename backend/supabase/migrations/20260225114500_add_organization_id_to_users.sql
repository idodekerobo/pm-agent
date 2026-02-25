-- Add organization_id to public.users table
ALTER TABLE public.users 
ADD COLUMN organization_id TEXT NULL;
