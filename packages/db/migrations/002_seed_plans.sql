INSERT INTO plans (id, name, days, traffic_limit_bytes, is_trial)
VALUES
  ('trial', 'Trial 24h', 1, 5000000000, TRUE),
  ('monthly', 'Month', 30, 100000000000, FALSE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  days = EXCLUDED.days,
  traffic_limit_bytes = EXCLUDED.traffic_limit_bytes,
  is_trial = EXCLUDED.is_trial;
