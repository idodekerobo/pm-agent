-- Create slack_installations table
-- One row per (user_id, slack_team_id) pair. Stores the bot token and workspace metadata
-- for each Slack workspace a PM Agent user has installed the app into.
CREATE TABLE IF NOT EXISTS public.slack_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    organization_id TEXT,

    -- Slack workspace info
    slack_team_id TEXT NOT NULL,
    slack_team_name TEXT,
    slack_bot_user_id TEXT NOT NULL,
    slack_app_id TEXT NOT NULL,

    -- Tokens (encrypted at rest, same pattern as integrations table)
    bot_token TEXT NOT NULL,           -- encrypted xoxb- token
    installer_slack_user_id TEXT,      -- Slack user_id of whoever clicked "Add to Slack"

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT slack_installations_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT slack_installations_unique_user_team
        UNIQUE (user_id, slack_team_id)
) TABLESPACE pg_default;


-- Create slack_channels table
-- Tracks which channels the bot has been added to and which ones the user has
-- enabled for the agent to post in. Source of truth for membership is Slack
-- (populated via member_joined_channel / member_left_channel events); is_enabled
-- is the user's override from the web settings UI.
CREATE TABLE IF NOT EXISTS public.slack_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL,

    slack_channel_id TEXT NOT NULL,
    slack_channel_name TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,   -- user can disable from web settings

    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT slack_channels_installation_id_fkey
        FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT slack_channels_unique_installation_channel
        UNIQUE (installation_id, slack_channel_id)
) TABLESPACE pg_default;


-- Indexes
CREATE INDEX IF NOT EXISTS idx_slack_installations_user_id
    ON public.slack_installations(user_id);

CREATE INDEX IF NOT EXISTS idx_slack_installations_team_id
    ON public.slack_installations(slack_team_id);

CREATE INDEX IF NOT EXISTS idx_slack_channels_installation_id
    ON public.slack_channels(installation_id);
