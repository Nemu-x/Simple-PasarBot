ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS subscription_url TEXT;

CREATE TABLE IF NOT EXISTS instructions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  lang TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (code, lang)
);
