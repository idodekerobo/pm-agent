ALTER TABLE public.integrations ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.integrations ALTER COLUMN expires_at DROP DEFAULT;
