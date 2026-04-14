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

export async function markUserTrialUnused(userId) {
  await pool.query("UPDATE users SET has_used_trial = FALSE WHERE id = $1", [userId]);
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

export async function listUsers() {
  const result = await pool.query(
    `SELECT id, telegram_id AS "telegramId", has_used_trial AS "hasUsedTrial",
      preferred_language AS "preferredLanguage", created_at AS "createdAt"
     FROM users ORDER BY created_at DESC`
  );
  return result.rows;
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

export async function upsertPlan({ id, name, days, trafficLimitBytes, isTrial }) {
  const result = await pool.query(
    `INSERT INTO plans (id, name, days, traffic_limit_bytes, is_trial)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      days = EXCLUDED.days,
      traffic_limit_bytes = EXCLUDED.traffic_limit_bytes,
      is_trial = EXCLUDED.is_trial
     RETURNING id, name, days, traffic_limit_bytes AS "trafficLimitBytes", is_trial AS "isTrial"`,
    [id, name, Number(days), trafficLimitBytes ? Number(trafficLimitBytes) : null, Boolean(isTrial)]
  );
  return result.rows[0];
}

export async function deletePlan(planId) {
  await pool.query("DELETE FROM plans WHERE id = $1", [planId]);
}

export async function upsertSubscription(subscription) {
  const id = subscription.id || randomUUID();
  const result = await pool.query(
    `INSERT INTO subscriptions (
      id, user_id, plan_id, node_id, status, is_trial, blocked, traffic_used_bytes, traffic_limit_bytes, starts_at, expires_at, subscription_url, remote_username
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT (user_id) DO UPDATE SET
      plan_id = EXCLUDED.plan_id,
      node_id = EXCLUDED.node_id,
      status = EXCLUDED.status,
      is_trial = EXCLUDED.is_trial,
      blocked = EXCLUDED.blocked,
      traffic_used_bytes = EXCLUDED.traffic_used_bytes,
      traffic_limit_bytes = EXCLUDED.traffic_limit_bytes,
      starts_at = EXCLUDED.starts_at,
      expires_at = EXCLUDED.expires_at,
      subscription_url = EXCLUDED.subscription_url,
      remote_username = EXCLUDED.remote_username
    RETURNING id, user_id AS "userId", plan_id AS "planId", node_id AS "nodeId", status, is_trial AS "isTrial",
      blocked, traffic_used_bytes AS "trafficUsedBytes", traffic_limit_bytes AS "trafficLimitBytes",
      starts_at AS "startsAt", expires_at AS "expiresAt", subscription_url AS "subscriptionUrl", remote_username AS "remoteUsername"`,
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
      new Date(subscription.expiresAt),
      subscription.subscriptionUrl || null,
      subscription.remoteUsername || null
    ]
  );
  return result.rows[0];
}

export async function getSubscriptionByUserId(userId) {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", plan_id AS "planId", node_id AS "nodeId", status, is_trial AS "isTrial",
      blocked, traffic_used_bytes AS "trafficUsedBytes", traffic_limit_bytes AS "trafficLimitBytes",
      starts_at AS "startsAt", expires_at AS "expiresAt", subscription_url AS "subscriptionUrl", remote_username AS "remoteUsername"
     FROM subscriptions WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function listSubscriptions() {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", plan_id AS "planId", node_id AS "nodeId", status, is_trial AS "isTrial",
      blocked, traffic_used_bytes AS "trafficUsedBytes", traffic_limit_bytes AS "trafficLimitBytes",
      starts_at AS "startsAt", expires_at AS "expiresAt", subscription_url AS "subscriptionUrl", remote_username AS "remoteUsername"
     FROM subscriptions ORDER BY starts_at DESC`
  );
  return result.rows;
}

export async function deleteSubscriptionByUserId(userId) {
  await pool.query("DELETE FROM subscriptions WHERE user_id = $1", [userId]);
}

export async function listInstructions(code, lang, platform) {
  const result = code
    ? await pool.query(
        `SELECT id, code, lang, platform, title, body, image_url AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM instructions
         WHERE code = $1
           AND ($2::text IS NULL OR lang = $2)
           AND ($3::text IS NULL OR platform = $3)
         ORDER BY lang ASC, platform ASC`,
        [code, lang || null, platform || null]
      )
    : await pool.query(
        `SELECT id, code, lang, platform, title, body, image_url AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM instructions
         WHERE ($1::text IS NULL OR lang = $1)
           AND ($2::text IS NULL OR platform = $2)
         ORDER BY code ASC, lang ASC, platform ASC`,
        [lang || null, platform || null]
      );
  return result.rows;
}

export async function getInstruction(code, lang, platform = "universal") {
  const direct = await pool.query(
    `SELECT id, code, lang, platform, title, body, image_url AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM instructions WHERE code = $1 AND lang = $2 AND platform = $3`,
    [code, lang, platform]
  );
  if (direct.rowCount) {
    return direct.rows[0];
  }
  const fallback = await pool.query(
    `SELECT id, code, lang, platform, title, body, image_url AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM instructions WHERE code = $1 AND lang = 'en' AND platform = $2`,
    [code, platform]
  );
  return fallback.rows[0] || null;
}

export async function upsertInstruction({ code, lang, platform, title, body, imageUrl }) {
  const result = await pool.query(
    `INSERT INTO instructions (id, code, lang, platform, title, body, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (code, lang, platform) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      image_url = EXCLUDED.image_url,
      updated_at = NOW()
     RETURNING id, code, lang, platform, title, body, image_url AS "imageUrl", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [randomUUID(), code, lang, platform || "universal", title, body, imageUrl || null]
  );
  return result.rows[0];
}

export async function setIntegrationSetting(key, value) {
  const result = await pool.query(
    `INSERT INTO integration_settings (key, value_json)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET
      value_json = EXCLUDED.value_json,
      updated_at = NOW()
     RETURNING key, value_json AS "value", updated_at AS "updatedAt"`,
    [key, JSON.stringify(value)]
  );
  return result.rows[0];
}

export async function getIntegrationSetting(key) {
  const result = await pool.query(
    `SELECT key, value_json AS "value", updated_at AS "updatedAt" FROM integration_settings WHERE key = $1`,
    [key]
  );
  return result.rows[0] || null;
}

export async function listSubscriptionProfiles() {
  const result = await pool.query(
    `SELECT id, name, duration_days AS "durationDays", traffic_limit_bytes AS "trafficLimitBytes",
      price_minor AS "priceMinor", currency, is_trial AS "isTrial",
      require_channel_member AS "requireChannelMember", node_template AS "nodeTemplate",
      pasar_template_id AS "pasarTemplateId", active, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM subscription_profiles
     ORDER BY duration_days ASC`
  );
  return result.rows;
}

export async function getSubscriptionProfile(profileId) {
  const result = await pool.query(
    `SELECT id, name, duration_days AS "durationDays", traffic_limit_bytes AS "trafficLimitBytes",
      price_minor AS "priceMinor", currency, is_trial AS "isTrial",
      require_channel_member AS "requireChannelMember", node_template AS "nodeTemplate",
      pasar_template_id AS "pasarTemplateId", active, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM subscription_profiles
     WHERE id = $1`,
    [profileId]
  );
  return result.rows[0] || null;
}

export async function upsertSubscriptionProfile(profile) {
  const result = await pool.query(
    `INSERT INTO subscription_profiles (
      id, name, duration_days, traffic_limit_bytes, price_minor, currency,
      is_trial, require_channel_member, node_template, pasar_template_id, active, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      duration_days = EXCLUDED.duration_days,
      traffic_limit_bytes = EXCLUDED.traffic_limit_bytes,
      price_minor = EXCLUDED.price_minor,
      currency = EXCLUDED.currency,
      is_trial = EXCLUDED.is_trial,
      require_channel_member = EXCLUDED.require_channel_member,
      node_template = EXCLUDED.node_template,
      pasar_template_id = EXCLUDED.pasar_template_id,
      active = EXCLUDED.active,
      updated_at = NOW()
    RETURNING id, name, duration_days AS "durationDays", traffic_limit_bytes AS "trafficLimitBytes",
      price_minor AS "priceMinor", currency, is_trial AS "isTrial",
      require_channel_member AS "requireChannelMember", node_template AS "nodeTemplate",
      pasar_template_id AS "pasarTemplateId", active, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      profile.id,
      profile.name,
      Number(profile.durationDays),
      profile.trafficLimitBytes == null ? null : Number(profile.trafficLimitBytes),
      Number(profile.priceMinor || 0),
      profile.currency || "RUB",
      Boolean(profile.isTrial),
      Boolean(profile.requireChannelMember ?? true),
      profile.nodeTemplate || "no-whitelist",
      profile.pasarTemplateId == null ? null : Number(profile.pasarTemplateId),
      Boolean(profile.active ?? true)
    ]
  );
  return result.rows[0];
}

export async function createPaymentEvent(payment) {
  const result = await pool.query(
    `INSERT INTO payment_events (
      id, user_id, subscription_id, plan_id, provider, status, amount_minor, currency, external_id, idempotency_key, payload_json
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
    ON CONFLICT (idempotency_key) DO UPDATE SET
      status = EXCLUDED.status,
      external_id = EXCLUDED.external_id,
      payload_json = EXCLUDED.payload_json
    RETURNING id, user_id AS "userId", subscription_id AS "subscriptionId", plan_id AS "planId",
      provider, status, amount_minor AS "amountMinor", currency, external_id AS "externalId",
      idempotency_key AS "idempotencyKey", payload_json AS "payload", created_at AS "createdAt"`,
    [
      payment.id || randomUUID(),
      payment.userId,
      payment.subscriptionId || null,
      payment.planId || null,
      payment.provider,
      payment.status,
      Number(payment.amountMinor || 0),
      payment.currency || "RUB",
      payment.externalId || null,
      payment.idempotencyKey || randomUUID(),
      JSON.stringify(payment.payload || {})
    ]
  );
  return result.rows[0];
}

export async function listPaymentEventsByUser(userId) {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", subscription_id AS "subscriptionId", plan_id AS "planId",
      provider, status, amount_minor AS "amountMinor", currency, external_id AS "externalId",
      idempotency_key AS "idempotencyKey", payload_json AS "payload", created_at AS "createdAt"
     FROM payment_events
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function createAuditLog(entry) {
  const result = await pool.query(
    `INSERT INTO audit_logs (id, actor, action, target, before_json, after_json, meta_json)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb)
     RETURNING id, actor, action, target, before_json AS "before", after_json AS "after", meta_json AS "meta", created_at AS "createdAt"`,
    [
      randomUUID(),
      entry.actor || "system",
      entry.action,
      entry.target,
      entry.before ? JSON.stringify(entry.before) : null,
      entry.after ? JSON.stringify(entry.after) : null,
      JSON.stringify(entry.meta || {})
    ]
  );
  return result.rows[0];
}

export async function listAuditLogs(limit = 100) {
  const result = await pool.query(
    `SELECT id, actor, action, target, before_json AS "before", after_json AS "after", meta_json AS "meta", created_at AS "createdAt"
     FROM audit_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [Number(limit)]
  );
  return result.rows;
}

export async function createBalanceEntry(entry) {
  const result = await pool.query(
    `INSERT INTO balance_ledger (id, user_id, entry_type, amount_minor, currency, source, source_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, user_id AS "userId", entry_type AS "entryType", amount_minor AS "amountMinor",
      currency, source, source_id AS "sourceId", created_at AS "createdAt"`,
    [entry.id || randomUUID(), entry.userId, entry.entryType, Number(entry.amountMinor), entry.currency || "RUB", entry.source, entry.sourceId || null]
  );
  return result.rows[0];
}

export async function getUserBalance(userId) {
  const result = await pool.query(
    `SELECT COALESCE(SUM(amount_minor), 0)::int AS "balanceMinor"
     FROM balance_ledger
     WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0]?.balanceMinor || 0;
}

export async function createSubscriptionOrder(order) {
  const result = await pool.query(
    `INSERT INTO subscription_orders (id, user_id, profile_id, status, amount_minor, currency, payment_transaction_id, idempotency_key, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (idempotency_key) DO UPDATE SET
      status = EXCLUDED.status,
      payment_transaction_id = EXCLUDED.payment_transaction_id,
      updated_at = NOW()
     RETURNING id, user_id AS "userId", profile_id AS "profileId", status, amount_minor AS "amountMinor",
      currency, payment_transaction_id AS "paymentTransactionId", idempotency_key AS "idempotencyKey",
      created_at AS "createdAt", updated_at AS "updatedAt"`,
    [
      order.id || randomUUID(),
      order.userId,
      order.profileId,
      order.status || "created",
      Number(order.amountMinor || 0),
      order.currency || "RUB",
      order.paymentTransactionId || null,
      order.idempotencyKey || randomUUID()
    ]
  );
  return result.rows[0];
}

export async function listPromoCodes() {
  const result = await pool.query(
    `SELECT id, code, kind, value_minor AS "valueMinor", value_days AS "valueDays", max_uses AS "maxUses",
      used_count AS "usedCount", active, expires_at AS "expiresAt", created_at AS "createdAt"
     FROM promo_codes
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function upsertPromoCode(promo) {
  const result = await pool.query(
    `INSERT INTO promo_codes (id, code, kind, value_minor, value_days, max_uses, active, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (code) DO UPDATE SET
      kind = EXCLUDED.kind,
      value_minor = EXCLUDED.value_minor,
      value_days = EXCLUDED.value_days,
      max_uses = EXCLUDED.max_uses,
      active = EXCLUDED.active,
      expires_at = EXCLUDED.expires_at
     RETURNING id, code, kind, value_minor AS "valueMinor", value_days AS "valueDays", max_uses AS "maxUses",
      used_count AS "usedCount", active, expires_at AS "expiresAt", created_at AS "createdAt"`,
    [
      promo.id || randomUUID(),
      promo.code,
      promo.kind || "amount",
      promo.valueMinor == null ? null : Number(promo.valueMinor),
      promo.valueDays == null ? null : Number(promo.valueDays),
      promo.maxUses == null ? null : Number(promo.maxUses),
      Boolean(promo.active ?? true),
      promo.expiresAt || null
    ]
  );
  return result.rows[0];
}

export async function listCampaigns() {
  const result = await pool.query(
    `SELECT id, name, channel, payload_json AS "payload", active, created_at AS "createdAt"
     FROM campaigns
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function upsertCampaign(campaign) {
  const result = await pool.query(
    `INSERT INTO campaigns (id, name, channel, payload_json, active)
     VALUES ($1,$2,$3,$4::jsonb,$5)
     ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      channel = EXCLUDED.channel,
      payload_json = EXCLUDED.payload_json,
      active = EXCLUDED.active
     RETURNING id, name, channel, payload_json AS "payload", active, created_at AS "createdAt"`,
    [campaign.id || randomUUID(), campaign.name, campaign.channel || "telegram", JSON.stringify(campaign.payload || {}), Boolean(campaign.active ?? true)]
  );
  return result.rows[0];
}

export async function createBroadcastJob(job) {
  const result = await pool.query(
    `INSERT INTO broadcast_jobs (id, campaign_id, status, payload_json, updated_at)
     VALUES ($1,$2,$3,$4::jsonb,NOW())
     RETURNING id, campaign_id AS "campaignId", status, payload_json AS "payload", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [job.id || randomUUID(), job.campaignId || null, job.status || "pending", JSON.stringify(job.payload || {})]
  );
  return result.rows[0];
}

export async function listBroadcastJobs(limit = 50) {
  const result = await pool.query(
    `SELECT id, campaign_id AS "campaignId", status, payload_json AS "payload", created_at AS "createdAt", updated_at AS "updatedAt"
     FROM broadcast_jobs
     ORDER BY created_at DESC
     LIMIT $1`,
    [Number(limit)]
  );
  return result.rows;
}

export async function listIncidentEvents(limit = 100) {
  const result = await pool.query(
    `SELECT id, level, source, message, meta_json AS "meta", created_at AS "createdAt"
     FROM incident_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [Number(limit)]
  );
  return result.rows;
}

export async function createIncidentEvent(event) {
  const result = await pool.query(
    `INSERT INTO incident_events (id, level, source, message, meta_json)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     RETURNING id, level, source, message, meta_json AS "meta", created_at AS "createdAt"`,
    [event.id || randomUUID(), event.level || "info", event.source || "system", event.message, JSON.stringify(event.meta || {})]
  );
  return result.rows[0];
}

export async function listChannelPolicies() {
  const result = await pool.query(
    `SELECT id, code, payload_json AS "payload", active, created_at AS "createdAt", updated_at AS "updatedAt"
     FROM channel_policies
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function upsertChannelPolicy(policy) {
  const result = await pool.query(
    `INSERT INTO channel_policies (id, code, payload_json, active, updated_at)
     VALUES ($1,$2,$3::jsonb,$4,NOW())
     ON CONFLICT (code) DO UPDATE SET
      payload_json = EXCLUDED.payload_json,
      active = EXCLUDED.active,
      updated_at = NOW()
     RETURNING id, code, payload_json AS "payload", active, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [policy.id || randomUUID(), policy.code, JSON.stringify(policy.payload || {}), Boolean(policy.active ?? true)]
  );
  return result.rows[0];
}
