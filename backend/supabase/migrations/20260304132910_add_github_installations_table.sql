-- Create github_installations table
-- One row per (user_id, installation_id) pair. Stores both the installation
-- (bot) token and the optional user access token for each GitHub App installation.
-- The installation_id is the stable identifier used for webhook routing.
CREATE TABLE IF NOT EXISTS public.github_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,

    -- GitHub App installation metadata
    installation_id BIGINT NOT NULL,
    account_login TEXT,             -- GitHub username or org name the app is installed on
    account_type TEXT,              -- 'User' or 'Organization'

    -- Installation (bot) token - expires every hour, regenerated via JWT + private key
    bot_token TEXT NOT NULL,        -- encrypted ghs_ token
    bot_token_expires_at TIMESTAMPTZ NOT NULL,

    -- User access token - optional, present when user authorized the app via OAuth
    -- May not expire (depends on app settings); refresh token present if expiration enabled
    user_token TEXT,                -- encrypted ghu_ token, nullable
    user_token_expires_at TIMESTAMPTZ,
    user_refresh_token TEXT,        -- nullable, only if token expiration is enabled

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT github_installations_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT github_installations_installation_id_key
        UNIQUE (installation_id)
) TABLESPACE pg_default;


-- Indexes
CREATE INDEX IF NOT EXISTS idx_github_installations_user_id
    ON public.github_installations(user_id);

CREATE INDEX IF NOT EXISTS idx_github_installations_installation_id
    ON public.github_installations(installation_id);
