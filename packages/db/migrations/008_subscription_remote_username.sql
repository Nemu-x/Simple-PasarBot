ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS remote_username TEXT;
