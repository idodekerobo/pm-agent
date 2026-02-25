-- Change organization_id from UUID to TEXT in integrations table
ALTER TABLE public.integrations 
ALTER COLUMN organization_id TYPE TEXT;
