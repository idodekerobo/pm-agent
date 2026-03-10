-- Seed pro plan with Test Stripe price ID.
-- monthly_credits and max_workspaces match the billing architecture plan.
INSERT INTO public.plans (name, monthly_credits, max_workspaces, is_active, stripe_price_id)
VALUES ('[test] pro', 50, 5, false, 'price_1T9WqXCXvXd8AZFXI3a8RI5G');
