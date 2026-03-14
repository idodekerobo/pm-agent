-- Adding new user columns based on revamped onboarding experience
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_scrape_observations TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_scrape_correction   TEXT,
  ADD COLUMN IF NOT EXISTS current_focus                  TEXT[],
  ADD COLUMN IF NOT EXISTS daily_activities               TEXT[];
