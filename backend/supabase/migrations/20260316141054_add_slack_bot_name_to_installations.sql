-- Adding slack_bot_name to slack_installations table
ALTER TABLE slack_installations
    ADD COLUMN IF NOT EXISTS slack_bot_name TEXT;
