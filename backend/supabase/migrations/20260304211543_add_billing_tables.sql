-- ============================================================
-- Plans catalog
-- A small, mostly-static table defining what each tier includes.
-- allowed_models and byok_enabled will be added when BYOK is implemented.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plans (
  id                UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name              TEXT NOT NULL UNIQUE,       -- 'free' | 'pro' | 'enterprise'
  monthly_credits   INT NOT NULL,               -- credits granted per billing cycle; -1 = unlimited
  max_workspaces    INT NOT NULL,               -- max workspaces allowed; -1 = unlimited
  is_active         BOOL NOT NULL DEFAULT TRUE, -- whether the plan is able to be used, TRUE by default
  stripe_price_id   TEXT,                       -- NULL for free plan; set after creating price in Stripe
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
) TABLESPACE pg_default;

-- Seed plans (stripe_price_id populated manually after Stripe setup)
INSERT INTO public.plans (name, monthly_credits, max_workspaces)
VALUES ('free', 20, 1);


-- ============================================================
-- Billing accounts
-- Top-level billing entity. Maps 1:1 with user now; organization_id
-- column is reserved for future org-level billing without schema changes.
-- Maps to a Stripe Customer.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.billing_accounts (
  id                   UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id              UUID,
  organization_id      TEXT,               -- NULL until org billing is added
  stripe_customer_id   TEXT UNIQUE,        -- set when user first initiates checkout
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_accounts_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE
) TABLESPACE pg_default;


-- ============================================================
-- Subscriptions
-- One active row per billing_account tracking the current plan.
-- Free users get a subscription row with stripe_subscription_id = NULL.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_account_id      UUID NOT NULL,
  plan_id                 UUID NOT NULL,
  stripe_subscription_id  TEXT UNIQUE,     -- NULL for free plan
  status                  TEXT NOT NULL DEFAULT 'active',  -- active | canceled | past_due | trialing
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscriptions_billing_account_id_fkey FOREIGN KEY (billing_account_id)
    REFERENCES public.billing_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id)
    REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE RESTRICT
) TABLESPACE pg_default;


-- ============================================================
-- Credit ledger
-- Append-only log of all credit events. Never update rows.
-- Current balance = SUM(delta) WHERE expires_at IS NULL OR expires_at > NOW().
--
-- type enum:
--   signup_grant        — free credits on account creation
--   subscription_renewal — monthly credits from a paid plan (expires_at = period_end)
--   run_consumed        — one run deducted (agent_session_id populated)
--   pack_purchased      — one-time credit pack
--   refund              — credits returned
-- ============================================================
CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id                   UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_account_id   UUID NOT NULL,
  delta                INT NOT NULL,       -- positive = grant, negative = consume
  type                 TEXT NOT NULL,      -- see enum above
  agent_session_id     UUID,              -- NULL except for run_consumed rows
  expires_at           TIMESTAMPTZ,        -- NULL = never expires; set for subscription_renewal rows
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_ledger_billing_account_id_fkey FOREIGN KEY (billing_account_id)
    REFERENCES public.billing_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT credit_ledger_agent_session_id_fkey FOREIGN KEY (agent_session_id)
    REFERENCES public.agent_sessions(id) ON UPDATE CASCADE ON DELETE SET NULL
) TABLESPACE pg_default;


-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_billing_accounts_user_id
  ON public.billing_accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_billing_accounts_stripe_customer_id
  ON public.billing_accounts(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_account_id
  ON public.subscriptions(billing_account_id);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_billing_account_id
  ON public.credit_ledger(billing_account_id);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_agent_session_id
  ON public.credit_ledger(agent_session_id);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_created_at
  ON public.credit_ledger(created_at);


-- ============================================================
-- RLS policies
-- Backend uses service role (bypasses RLS). Policies protect
-- direct Supabase client access from the frontend.
-- ============================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

-- Plans: readable by anyone (authenticated + anonymous) for pricing pages
CREATE POLICY "plans_read_all" ON public.plans
  FOR SELECT TO anon, authenticated USING (true);

-- Billing accounts: user owns their own row
CREATE POLICY "billing_accounts_own_row" ON public.billing_accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Subscriptions: accessible via billing_account ownership
CREATE POLICY "subscriptions_own_rows" ON public.subscriptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.billing_accounts ba
      WHERE ba.id = billing_account_id
        AND ba.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.billing_accounts ba
      WHERE ba.id = billing_account_id
        AND ba.user_id = auth.uid()
    )
  );

-- Credit ledger: accessible via billing_account ownership
CREATE POLICY "credit_ledger_own_rows" ON public.credit_ledger
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.billing_accounts ba
      WHERE ba.id = billing_account_id
        AND ba.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.billing_accounts ba
      WHERE ba.id = billing_account_id
        AND ba.user_id = auth.uid()
    )
  );


-- ============================================================
-- Updated handle_new_user() trigger
-- Replaces the existing function in-place. The trigger binding
-- (on_auth_user_created) does not change — only the function body.
-- On every new auth.users insert, this now also creates:
--   1. public.users row (existing behavior)
--   2. billing_accounts row
--   3. subscriptions row (free plan)
--   4. credit_ledger row (signup_grant of 20 credits)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_billing_account_id UUID;
  free_plan_id UUID;
BEGIN
  -- Existing: create public.users row
  INSERT INTO public.users (id, email, organization_id)
  VALUES (new.id, new.email, gen_random_uuid()::TEXT);

  -- New: create billing account linked to this user
  INSERT INTO public.billing_accounts (user_id)
  VALUES (new.id)
  RETURNING id INTO new_billing_account_id;

  -- New: look up free plan id
  SELECT id INTO free_plan_id
  FROM public.plans
  WHERE name = 'free'
  LIMIT 1;

  -- New: create free subscription
  INSERT INTO public.subscriptions (billing_account_id, plan_id, status)
  VALUES (new_billing_account_id, free_plan_id, 'active');

  -- New: grant signup credits (never expire)
  INSERT INTO public.credit_ledger (billing_account_id, delta, type)
  VALUES (new_billing_account_id, 20, 'signup_grant');

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
