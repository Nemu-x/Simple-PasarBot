INSERT INTO subscription_profiles (
  id, name, duration_days, traffic_limit_bytes, price_minor, currency, is_trial, require_channel_member, node_template, active
)
VALUES
  ('trial', 'Trial', 1, 5000000000, 0, 'RUB', TRUE, TRUE, 'no-whitelist', TRUE),
  ('m1', '1 month', 30, NULL, 49900, 'RUB', FALSE, TRUE, 'no-whitelist', TRUE),
  ('m3', '3 months', 90, NULL, 129900, 'RUB', FALSE, TRUE, 'no-whitelist', TRUE),
  ('m6', '6 months', 180, NULL, 229900, 'RUB', FALSE, TRUE, 'no-whitelist', TRUE),
  ('m9', '9 months', 270, NULL, 309900, 'RUB', FALSE, TRUE, 'no-whitelist', TRUE),
  ('m12', '12 months', 365, NULL, 389900, 'RUB', FALSE, TRUE, 'no-whitelist', TRUE)
ON CONFLICT (id) DO NOTHING;
