-- Update handle_new_user to assign a random UUID as organization_id.
-- organization_id remains TEXT so it is forward-compatible with multi-tenancy
-- (e.g. human-readable slugs or prefixed IDs in the future).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, organization_id)
  VALUES (new.id, new.email, gen_random_uuid()::TEXT);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
