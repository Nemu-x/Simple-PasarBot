CREATE TABLE users (
  id TEXT PRIMARY KEY,
  telegram_id TEXT UNIQUE NOT NULL,
  has_used_trial BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  days INTEGER NOT NULL,
  traffic_limit_bytes BIGINT,
  is_trial BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  plan_id TEXT NOT NULL REFERENCES plans(id),
  node_id TEXT,
  status TEXT NOT NULL,
  is_trial BOOLEAN NOT NULL DEFAULT FALSE,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  traffic_used_bytes BIGINT NOT NULL DEFAULT 0,
  traffic_limit_bytes BIGINT,
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
