-- ============================================================
-- Model usage
-- Internal telemetry table. Best-effort insert after each agent run —
-- failures here never block or fail a run. NOT used for billing truth
-- (that's credit_ledger). Used for cost analytics: what we spend on
-- LLM APIs, per user/org/model/provider.
--
-- user_id and organization_id are denormalized here intentionally
-- for fast aggregation queries without joining through billing_accounts.
--
-- credit_ledger_id is set after the credit deduction completes,
-- linking the cost record back to the billing event that caused it.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.model_usage (
  id                       UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_session_id         UUID NOT NULL,
  billing_account_id       UUID NOT NULL,
  user_id                  UUID NOT NULL,
  organization_id          TEXT,
  credit_ledger_id         UUID,           -- set after credit deduction; nullable
  provider                 TEXT NOT NULL,  -- 'openai' | 'anthropic' | 'google'
  model                    TEXT NOT NULL,  -- 'gpt-4o' | 'gpt-4o-mini' | 'gpt-5.2' etc.
  byok                     BOOL NOT NULL DEFAULT FALSE,
  input_tokens             INT,
  output_tokens            INT,
  cached_input_tokens      INT,
  reasoning_tokens         INT,
  input_token_price_usd    NUMERIC(12,10), -- price per token at time of run (snapshot)
  output_token_price_usd   NUMERIC(12,10), -- price per token at time of run (snapshot)
  provider_cost_usd        NUMERIC(10,6),  -- pre-computed: (input*price) + (output*price)
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT model_usage_agent_session_id_fkey FOREIGN KEY (agent_session_id)
    REFERENCES public.agent_sessions(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT model_usage_billing_account_id_fkey FOREIGN KEY (billing_account_id)
    REFERENCES public.billing_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT model_usage_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT model_usage_credit_ledger_id_fkey FOREIGN KEY (credit_ledger_id)
    REFERENCES public.credit_ledger(id) ON UPDATE CASCADE ON DELETE SET NULL
) TABLESPACE pg_default;


-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_model_usage_agent_session_id
  ON public.model_usage(agent_session_id);

CREATE INDEX IF NOT EXISTS idx_model_usage_billing_account_id
  ON public.model_usage(billing_account_id);

CREATE INDEX IF NOT EXISTS idx_model_usage_user_id
  ON public.model_usage(user_id);

CREATE INDEX IF NOT EXISTS idx_model_usage_organization_id
  ON public.model_usage(organization_id);

CREATE INDEX IF NOT EXISTS idx_model_usage_created_at
  ON public.model_usage(created_at);


-- ============================================================
-- RLS
-- Backend service role bypasses this. Policy prevents direct
-- frontend client from reading other users' usage data.
-- ============================================================
ALTER TABLE public.model_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "model_usage_own_rows" ON public.model_usage
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
