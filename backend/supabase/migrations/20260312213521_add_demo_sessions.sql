-- Demo sessions table for identity bridging across subdomains.
-- Created during a live demo on the landing page; claimed after signup.
-- TTL: 18 hours (enforced by expires_at; cleanup via cron or on-read).

CREATE TABLE IF NOT EXISTS demo_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    demo_token      TEXT NOT NULL UNIQUE,   -- opaque token threaded through CTAs + signup URL
    company_url     TEXT NOT NULL,          -- URL entered in the live demo
    turn_count      INTEGER NOT NULL DEFAULT 0,
    items           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- full conversation [{role, content}, ...]
    claimed         BOOLEAN NOT NULL DEFAULT FALSE,
    claimed_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '18 hours')
);

-- Fast lookup by token (used on every /demo/run request)
CREATE INDEX IF NOT EXISTS idx_demo_sessions_token ON demo_sessions (demo_token);

-- Fast lookup by claimed_user_id (used during auth callback)
CREATE INDEX IF NOT EXISTS idx_demo_sessions_claimed_user ON demo_sessions (claimed_user_id) WHERE claimed_user_id IS NOT NULL;
