CREATE TABLE subscription_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  traffic_limit_bytes BIGINT,
  price_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RUB',
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  require_channel_member BOOLEAN NOT NULL DEFAULT TRUE,
  node_template TEXT NOT NULL DEFAULT 'no-whitelist',
  pasar_template_id INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX subscription_profiles_name_idx ON subscription_profiles(name);
