-- ============================================================
-- Admin plan
-- Internal-use only plan with unlimited credits and workspaces.
-- is_active = FALSE prevents it from being surfaced to users
-- or selected during normal subscription flows.
-- Must be manually assigned via direct DB update.
-- ============================================================
INSERT INTO public.plans (name, monthly_credits, max_workspaces, is_active)
VALUES ('admin', -1, -1, FALSE);
