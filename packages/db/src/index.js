import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString
});

export async function healthCheck() {
  await pool.query("SELECT 1");
}

export async function closeDb() {
  await pool.end();
}

export async function getOrCreateUser(telegramId) {
  const key = String(telegramId);
  const existing = await pool.query(
    "SELECT id, telegram_id AS \"telegramId\", has_used_trial AS \"hasUsedTrial\", preferred_language AS \"preferredLanguage\", created_at AS \"createdAt\" FROM users WHERE telegram_id = $1",
    [key]
  );
  if (existing.rowCount) {
    return existing.rows[0];
  }

  const created = await pool.query(
    "INSERT INTO users (id, telegram_id) VALUES ($1, $2) RETURNING id, telegram_id AS \"telegramId\", has_used_trial AS \"hasUsedTrial\", preferred_language AS \"preferredLanguage\", created_at AS \"createdAt\"",
    [randomUUID(), key]
  );
  return created.rows[0];
}

export async function markUserTrialUsed(userId) {
  await pool.query("UPDATE users SET has_used_trial = TRUE WHERE id = $1", [userId]);
}

export async function setUserPreferredLanguage(telegramId, preferredLanguage) {
  const result = await pool.query(
    `UPDATE users
     SET preferred_language = $2
     WHERE telegram_id = $1
     RETURNING id, telegram_id AS "telegramId", has_used_trial AS "hasUsedTrial",
      preferred_language AS "preferredLanguage", created_at AS "createdAt"`,
    [String(telegramId), preferredLanguage]
  );
  return result.rows[0] || null;
}

export async function listPlans() {
  const result = await pool.query(
    "SELECT id, name, days, traffic_limit_bytes AS \"trafficLimitBytes\", is_trial AS \"isTrial\" FROM plans ORDER BY days ASC"
  );
  return result.rows;
}

export async function getPlan(planId) {
  const result = await pool.query(
    "SELECT id, name, days, traffic_limit_bytes AS \"trafficLimitBytes\", is_trial AS \"isTrial\" FROM plans WHERE id = $1",
    [planId]
  );
  return result.rows[0] || null;
}

export async function upsertSubscription(subscription) {
  const id = subscription.id || randomUUID();
  const result = await pool.query(
    `INSERT INTO subscriptions (
      id, user_id, plan_id, node_id, status, is_trial, blocked, traffic_used_bytes, traffic_limit_bytes, starts_at, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (user_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      node_id = EXCLUDED.node_id,
      status = EXCLUDED.status,
      is_trial = EXCLUDED.is_trial,
      blocked = EXCLUDED.blocked,
      traffic_used_bytes = EXCLUDED.traffic_used_bytes,
      traffic_limit_bytes = EXCLUDED.traffic_limit_bytes,
      starts_at = EXCLUDED.starts_at,
      expires_at = EXCLUDED.expires_at
    RETURNING id, user_id AS "userId", plan_id AS "planId", node_id AS "nodeId", status, is_trial AS "isTrial",
      blocked, traffic_used_bytes AS "trafficUsedBytes", traffic_limit_bytes AS "trafficLimitBytes",
      starts_at AS "startsAt", expires_at AS "expiresAt"`,
    [
      id,
      subscription.userId,
      subscription.planId,
      subscription.nodeId || null,
      subscription.status,
      Boolean(subscription.isTrial),
      Boolean(subscription.blocked),
      Number(subscription.trafficUsedBytes || 0),
      subscription.trafficLimitBytes ? Number(subscription.trafficLimitBytes) : null,
      new Date(subscription.startsAt),
      new Date(subscription.expiresAt)
    ]
  );
  return result.rows[0];
}

export async function getSubscriptionByUserId(userId) {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", plan_id AS "planId", node_id AS "nodeId", status, is_trial AS "isTrial",
      blocked, traffic_used_bytes AS "trafficUsedBytes", traffic_limit_bytes AS "trafficLimitBytes",
      starts_at AS "startsAt", expires_at AS "expiresAt"
     FROM subscriptions WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function listSubscriptions() {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", plan_id AS "planId", node_id AS "nodeId", status, is_trial AS "isTrial",
      blocked, traffic_used_bytes AS "trafficUsedBytes", traffic_limit_bytes AS "trafficLimitBytes",
      starts_at AS "startsAt", expires_at AS "expiresAt"
     FROM subscriptions ORDER BY starts_at DESC`
  );
  return result.rows;
}
