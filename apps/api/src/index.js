import express from "express";
import crypto from "node:crypto";
import QRCode from "qrcode";
import {
  createBalanceEntry,
  createBroadcastJob,
  createIncidentEvent,
  createSubscriptionOrder,
  createAuditLog,
  createPaymentEvent,
  deletePlan,
  deleteSubscriptionByUserId,
  getOrCreateUser,
  getInstruction,
  getUserBalance,
  getIntegrationSetting,
  getPlan,
  getSubscriptionProfile,
  getSubscriptionByUserId,
  healthCheck,
  listAuditLogs,
  listInstructions,
  listBroadcastJobs,
  listCampaigns,
  listChannelPolicies,
  listIncidentEvents,
  listPaymentEventsByUser,
  listPlans,
  listPromoCodes,
  listSubscriptionProfiles,
  listSubscriptions,
  listUsers,
  markUserTrialUsed,
  markUserTrialUnused,
  setUserPreferredLanguage,
  setIntegrationSetting,
  upsertCampaign,
  upsertChannelPolicy,
  upsertPromoCode,
  upsertSubscriptionProfile,
  upsertPlan,
  upsertInstruction,
  upsertSubscription
} from "@simple-pasarbot/db";
import { canStartTrial, evaluateSubscription, shouldBlockForTraffic } from "@simple-pasarbot/domain";
import { deleteUser, getBaseInfo, resumeUser, suspendUser, syncUser, updateUserLimits } from "@simple-pasarbot/pasarguard";
import { getProviderAdapter } from "@simple-pasarbot/payment-hub";
import { normalizeLang, requestLang, t } from "./i18n.js";
import {
  createUserFromTemplate,
  deletePanelUser,
  fetchAdminToken,
  getUserTemplates,
  getUsersSimple,
  tryFetchApiKeyFromPanel
} from "./pasarguard-panel.js";

const app = express();
const channelCache = new Map();
const requestBuckets = new Map();

const cfg = {
  port: Number(process.env.API_PORT || 8080),
  pasarguardBaseUrl: process.env.PASARGUARD_BASE_URL || "",
  pasarguardApiKey: process.env.PASARGUARD_API_KEY || "",
  botToken: process.env.BOT_TOKEN || "",
  telegramChannel: process.env.TELEGRAM_CHANNEL || "",
  adminApiToken: process.env.ADMIN_API_TOKEN || "",
  webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || "dev-secret",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:8080",
  paymentProvider: process.env.PAYMENT_PROVIDER_NAME || "Payment",
  paymentApiKey: process.env.PAYMENT_API_KEY || ""
};

function buildSubscriptionUrl(subscriptionId) {
  return `${cfg.appBaseUrl.replace(/\/$/, "")}/subscription/${subscriptionId}`;
}

function normalizeTemplateKey(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "wl" || raw === "whitelist" || raw === "wl-user") {
    return "wl";
  }
  return "no_wl";
}

function pickTemplateId(config, templateKey) {
  if (config.trialTemplateId) {
    return Number(config.trialTemplateId);
  }
  if (templateKey === "wl" && config.wlTemplateId) {
    return Number(config.wlTemplateId);
  }
  if (templateKey === "no_wl" && config.noWlTemplateId) {
    return Number(config.noWlTemplateId);
  }
  return null;
}

function isPasarConnected(config) {
  return Boolean(config.panelUrl && config.username && config.password);
}

function parseInboundList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function interpolateTemplate(template, params) {
  let result = String(template || "");
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}

function toAbsoluteSubscriptionUrl(rawUrl, panelUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  const base = String(panelUrl || "").replace(/\/$/, "");
  if (!base) {
    return value;
  }
  return `${base}${value.startsWith("/") ? "" : "/"}${value}`;
}

async function getPasarRuntimeConfig() {
  const saved = await getIntegrationSetting("pasarguard");
  const data = saved?.value || {};
  return {
    nodeApiBaseUrl: data.nodeApiBaseUrl || cfg.pasarguardBaseUrl || "",
    apiKey: data.apiKey || cfg.pasarguardApiKey || "",
    wlTemplateUser: data.wlTemplateUser || "",
    noWlTemplateUser: data.noWlTemplateUser || "",
    wlInbounds: parseInboundList(data.wlInbounds),
    noWlInbounds: parseInboundList(data.noWlInbounds),
    subscriptionUrlPattern: data.subscriptionUrlPattern || "",
    panelUrl: data.panelUrl || "",
    username: data.username || "",
    password: data.password || "",
    wlTemplateId: data.wlTemplateId || null,
    noWlTemplateId: data.noWlTemplateId || null,
    trialTemplateId: data.trialTemplateId || null
  };
}

async function instructionBundle(lang, subscriptionUrl, platform = "universal") {
  const instruction =
    (await getInstruction("connect_vpn", lang, platform)) ||
    {
      title: lang === "ru" ? "Как подключиться" : "How to connect",
      body:
        lang === "ru"
          ? "Скопируйте ссылку подписки и импортируйте ее в VPN-клиент."
          : "Copy subscription URL and import it into your VPN client."
    };
  const qrDataUrl = subscriptionUrl ? await QRCode.toDataURL(subscriptionUrl, { width: 320, margin: 1 }) : null;
  return {
    instruction,
    qrDataUrl
  };
}

function normalizeNodeTemplate(value) {
  const raw = String(value || "").toLowerCase();
  if (raw === "wl" || raw === "whitelist") return "whitelist";
  return "no-whitelist";
}

function parseTelegramInitData(rawInitData) {
  const out = {};
  const params = new URLSearchParams(String(rawInitData || ""));
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

function verifyTelegramInitData(initDataRaw) {
  const initData = String(initDataRaw || "");
  if (!initData || !cfg.botToken) return false;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return false;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(cfg.botToken).digest();
  const digest = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  return digest === hash;
}

function checkRateLimit(req, keyPrefix, limit = 60, windowMs = 60_000) {
  const id = `${keyPrefix}:${req.ip || req.socket.remoteAddress || "unknown"}`;
  const now = Date.now();
  const current = requestBuckets.get(id) || { count: 0, resetAt: now + windowMs };
  if (current.resetAt <= now) {
    current.count = 0;
    current.resetAt = now + windowMs;
  }
  current.count += 1;
  requestBuckets.set(id, current);
  return current.count > limit;
}

async function checkChannelMembership(telegramId) {
  if (!cfg.telegramChannel || !cfg.botToken) return true;
  const key = `${telegramId}:${cfg.telegramChannel}`;
  const cached = channelCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const endpoint = `https://api.telegram.org/bot${cfg.botToken}/getChatMember`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: cfg.telegramChannel, user_id: Number(telegramId) })
  });
  const payload = await response.json().catch(() => ({}));
  const status = payload?.result?.status;
  const ok = ["creator", "administrator", "member"].includes(String(status || ""));
  channelCache.set(key, { value: ok, expiresAt: now + 2 * 60 * 1000 });
  return ok;
}

async function createOrRenewSubscription({ user, profile, nodeTemplate, lang, platform }) {
  const startsAt = new Date();
  const existing = await getSubscriptionByUserId(user.id);
  const baseStart = existing?.expiresAt && new Date(existing.expiresAt) > startsAt ? new Date(existing.expiresAt) : startsAt;
  const expiresAt = new Date(baseStart.getTime() + profile.durationDays * 24 * 60 * 60 * 1000);
  const passthroughNode = normalizeTemplateKey(nodeTemplate || profile.nodeTemplate || "no-whitelist");
  const pasarCfg = await getPasarRuntimeConfig();
  const generatedEmail = `tg${user.telegramId}_${Date.now()}`;
  const generatedSubscriptionUrl = buildSubscriptionUrl(`${user.id}-${profile.id}`);
  const subscription = {
    id: existing?.id || `${user.id}-${profile.id}`,
    userId: user.id,
    planId: profile.id,
    status: profile.isTrial ? "trial" : "active",
    isTrial: Boolean(profile.isTrial),
    blocked: false,
    trafficUsedBytes: existing?.trafficUsedBytes || 0,
    trafficLimitBytes: profile.trafficLimitBytes,
    nodeId: passthroughNode,
    subscriptionUrl: existing?.subscriptionUrl || generatedSubscriptionUrl,
    startsAt: existing?.startsAt || startsAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    remoteUsername: existing?.remoteUsername || null
  };

  let saved = await upsertSubscription(subscription);
  const selectedTemplateId = profile.pasarTemplateId || pickTemplateId(pasarCfg, passthroughNode);
  if (isPasarConnected(pasarCfg) && selectedTemplateId) {
    const panelToken = await fetchAdminToken(pasarCfg.panelUrl, pasarCfg.username, pasarCfg.password);
    const created = await createUserFromTemplate(pasarCfg.panelUrl, panelToken, {
      templateId: Number(selectedTemplateId),
      username: generatedEmail,
      note: `telegram:${user.telegramId}`
    });
    if (created?.subscription_url) {
      saved = await upsertSubscription({
        ...saved,
        subscriptionUrl: toAbsoluteSubscriptionUrl(created.subscription_url, pasarCfg.panelUrl),
        remoteUsername: created.username || generatedEmail
      });
    }
  }
  const bundle = await instructionBundle(lang, saved.subscriptionUrl, platform || "universal");
  return { subscription: saved, instruction: bundle.instruction, qrDataUrl: bundle.qrDataUrl };
}

app.get("/health", (_req, res) => {
  healthCheck()
    .then(() => res.json({ ok: true }))
    .catch((error) => res.status(500).json({ ok: false, error: error.message }));
});

app.post("/payments/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  const lang = normalizeLang(req.headers["x-lang"]);
  const signature = req.headers["x-signature"];
  const rawBody = req.body.toString("utf8");
  const paymentAdapter = getProviderAdapter("generic");
  if (!paymentAdapter.verifyWebhook(rawBody, String(signature || ""), cfg.webhookSecret)) {
    return res.status(401).json({ error: t(lang, "invalidSignature") });
  }

  const event = JSON.parse(rawBody);
  if (event.status === "paid") {
    const user = await getOrCreateUser(event.userId);
    const sub = await getSubscriptionByUserId(user.id);
    if (sub) {
      sub.blocked = false;
      sub.status = "active";
      const profile = (await getSubscriptionProfile(sub.planId)) || { durationDays: 30 };
      sub.expiresAt = new Date(new Date(sub.expiresAt).getTime() + profile.durationDays * 24 * 60 * 60 * 1000).toISOString();
      await upsertSubscription(sub);
      await createPaymentEvent({
        userId: sub.userId,
        subscriptionId: sub.id,
        planId: sub.planId,
        provider: cfg.paymentProvider,
        status: "paid",
        amountMinor: Number(event.amountMinor || 0),
        currency: event.currency || "RUB",
        externalId: event.externalId || null,
        idempotencyKey: event.idempotencyKey || req.headers["x-idempotency-key"],
        payload: event
      });
    }
  }
  return res.json({ ok: true });
});

app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (req.protocol === "https" || req.headers["x-forwarded-proto"] === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});
app.use((req, res, next) => {
  if (checkRateLimit(req, "api", 240, 60_000)) {
    return res.status(429).json({ error: "Too many requests" });
  }
  return next();
});

app.use("/admin", (req, res, next) => {
  if (checkRateLimit(req, "admin-api", 120, 60_000)) {
    return res.status(429).json({ error: "Too many admin requests" });
  }
  if (cfg.adminApiToken) {
    const token = req.headers["x-admin-token"];
    if (!token || token !== cfg.adminApiToken) {
      return res.status(401).json({ error: "unauthorized" });
    }
  }
  return next();
});

app.get("/plans", async (_req, res) => {
  res.json({ plans: await listPlans() });
});

app.get("/profiles", async (_req, res) => {
  res.json({ profiles: await listSubscriptionProfiles() });
});

app.post("/trial/start", async (req, res) => {
  const lang = requestLang(req);
  const { telegramId, channelMember = true, nodeTemplate = "no-whitelist", platform = "universal" } = req.body;
  if (!telegramId) {
    return res.status(400).json({ error: t(lang, "telegramRequired") });
  }
  const isMember = channelMember && (await checkChannelMembership(telegramId));
  if (!isMember) {
    const channelHint = cfg.telegramChannel ? ` (${cfg.telegramChannel})` : "";
    return res.status(403).json({ error: `${t(lang, "channelRequired")}${channelHint}` });
  }

  const user = await getOrCreateUser(telegramId);
  if (!canStartTrial(user)) {
    return res.status(409).json({ error: t(lang, "trialUsed") });
  }
  const trialProfile = await getSubscriptionProfile("trial");
  if (!trialProfile) {
    return res.status(500).json({ error: t(lang, "trialMissing") });
  }
  await markUserTrialUsed(user.id);
  const bundle = await createOrRenewSubscription({
    user,
    profile: trialProfile,
    nodeTemplate,
    lang,
    platform: String(platform)
  });
  return res.json({
    message: t(lang, "trialStarted"),
    subscription: bundle.subscription,
    instruction: bundle.instruction,
    qrDataUrl: bundle.qrDataUrl
  });
});

app.get("/cabinet/:telegramId", async (req, res) => {
  const user = await getOrCreateUser(req.params.telegramId);
  const lang = requestLang(req, user.preferredLanguage || "en");
  const platform = req.query.platform ? String(req.query.platform) : "universal";
  const subscription = await getSubscriptionByUserId(user.id);
  const status = subscription ? evaluateSubscription(subscription) : "no_subscription";
  const bundle = await instructionBundle(lang, subscription?.subscriptionUrl || null, platform);
  res.json({
    message: t(lang, "cabinetLoaded"),
    user,
    subscription,
    status,
    instruction: bundle.instruction,
    qrDataUrl: bundle.qrDataUrl
  });
});

app.post("/users/language", async (req, res) => {
  const { telegramId, lang } = req.body;
  if (!telegramId) {
    return res.status(400).json({ error: t(requestLang(req), "telegramRequired") });
  }
  await getOrCreateUser(telegramId);
  const saved = await setUserPreferredLanguage(telegramId, normalizeLang(lang));
  return res.json({ user: saved, message: t(saved?.preferredLanguage || "en", "languageUpdated") });
});

app.post("/payments/create", async (req, res) => {
  const lang = requestLang(req);
  const { userId, planId, amount, idempotencyKey } = req.body;
  if (!userId) {
    return res.status(400).json({ error: t(lang, "userIdRequired") });
  }
  const user = await getOrCreateUser(userId);
  const profile = (await getSubscriptionProfile(planId || "m1")) || (await getSubscriptionProfile("m1"));
  const paymentAdapter = getProviderAdapter("generic");
  const payload = paymentAdapter.createPayload({
    userId: String(user.telegramId),
    planId: profile?.id || "m1",
    amount: Number(amount || profile?.priceMinor || 0) / 100,
    callbackUrl: `${cfg.appBaseUrl}/payments/webhook`
  });
  let invoice = null;
  if (cfg.paymentApiKey) {
    invoice = await paymentAdapter.createInvoice(cfg.paymentApiKey, payload).catch(() => null);
  }
  await createPaymentEvent({
    userId: user.id,
    planId: profile?.id || "m1",
    provider: cfg.paymentProvider,
    status: invoice ? "pending" : "prepared",
    amountMinor: Number(amount || profile?.priceMinor || 0),
    currency: profile?.currency || "RUB",
    externalId: invoice?.id || null,
    idempotencyKey: idempotencyKey || req.headers["x-idempotency-key"],
    payload: { payload, invoice }
  });
  res.json({ message: t(lang, "paymentPrepared"), provider: cfg.paymentProvider, payment: payload, invoice });
});

app.post("/subscriptions/create", async (req, res) => {
  const lang = requestLang(req);
  const { telegramId, profileId, nodeTemplate = "no-whitelist", platform = "universal" } = req.body;
  if (!telegramId || !profileId) {
    return res.status(400).json({ error: "telegramId and profileId are required" });
  }
  const profile = await getSubscriptionProfile(profileId);
  if (!profile || !profile.active) {
    return res.status(404).json({ error: "Profile not found" });
  }
  if (profile.requireChannelMember && !(await checkChannelMembership(telegramId))) {
    const channelHint = cfg.telegramChannel ? ` (${cfg.telegramChannel})` : "";
    return res.status(403).json({ error: `${t(lang, "channelRequired")}${channelHint}` });
  }
  const user = await getOrCreateUser(telegramId);
  if (profile.isTrial && !canStartTrial(user)) {
    return res.status(409).json({ error: t(lang, "trialUsed") });
  }
  if (profile.isTrial) {
    await markUserTrialUsed(user.id);
  }
  const bundle = await createOrRenewSubscription({ user, profile, nodeTemplate, lang, platform });
  return res.json({ ok: true, profile, ...bundle });
});

app.post("/subscriptions/renew", async (req, res) => {
  const { telegramId, profileId } = req.body;
  if (!telegramId || !profileId) {
    return res.status(400).json({ error: "telegramId and profileId are required" });
  }
  const user = await getOrCreateUser(telegramId);
  const profile = await getSubscriptionProfile(profileId);
  if (!profile) {
    return res.status(404).json({ error: "Profile not found" });
  }
  const bundle = await createOrRenewSubscription({ user, profile, nodeTemplate: profile.nodeTemplate, lang: requestLang(req), platform: "universal" });
  return res.json({ ok: true, ...bundle });
});

app.post("/subscriptions/change-profile", async (req, res) => {
  const { telegramId, profileId } = req.body;
  if (!telegramId || !profileId) {
    return res.status(400).json({ error: "telegramId and profileId are required" });
  }
  const user = await getOrCreateUser(telegramId);
  const current = await getSubscriptionByUserId(user.id);
  if (!current) {
    return res.status(404).json({ error: "Subscription not found" });
  }
  const profile = await getSubscriptionProfile(profileId);
  const next = await upsertSubscription({ ...current, planId: profile.id, trafficLimitBytes: profile.trafficLimitBytes, nodeId: profile.nodeTemplate });
  return res.json({ ok: true, subscription: next });
});

app.post("/miniapp/session", async (req, res) => {
  if (!verifyTelegramInitData(req.body?.initData)) {
    return res.status(401).json({ error: "invalid initData signature" });
  }
  const data = parseTelegramInitData(req.body?.initData);
  const userRaw = data.user ? JSON.parse(data.user) : null;
  if (!userRaw?.id) {
    return res.status(400).json({ error: "invalid initData" });
  }
  const user = await getOrCreateUser(String(userRaw.id));
  const subscription = await getSubscriptionByUserId(user.id);
  const profile = subscription?.planId ? await getSubscriptionProfile(subscription.planId) : null;
  const payments = await listPaymentEventsByUser(user.id);
  return res.json({ user, subscription, profile, payments });
});

app.get("/admin/subscriptions", async (_req, res) => {
  res.json({ data: await listSubscriptions() });
});

app.get("/admin/users", async (_req, res) => {
  res.json({ data: await listUsers() });
});

app.get("/admin/profiles", async (_req, res) => {
  res.json({ data: await listSubscriptionProfiles() });
});

app.post("/admin/profiles", async (req, res) => {
  const saved = await upsertSubscriptionProfile(req.body);
  await createAuditLog({ actor: "admin", action: "profile.upsert", target: `profile:${saved.id}`, after: saved });
  res.json({ profile: saved });
});

app.get("/admin/payments/:telegramId", async (req, res) => {
  const user = await getOrCreateUser(String(req.params.telegramId));
  res.json({ data: await listPaymentEventsByUser(user.id) });
});

app.get("/admin/audit", async (req, res) => {
  res.json({ data: await listAuditLogs(Number(req.query.limit || 100)) });
});

app.get("/admin/instructions", async (req, res) => {
  const lang = requestLang(req);
  const data = await listInstructions(
    req.query.code ? String(req.query.code) : undefined,
    req.query.locale ? normalizeLang(req.query.locale) : undefined,
    req.query.platform ? String(req.query.platform) : undefined
  );
  res.json({ message: t(lang, "cabinetLoaded"), data });
});

app.post("/admin/instructions", async (req, res) => {
  const lang = requestLang(req);
  const { code, locale, platform, title, body, imageUrl } = req.body;
  if (!code) {
    return res.status(400).json({ error: t(lang, "codeRequired") });
  }
  if (!title) {
    return res.status(400).json({ error: t(lang, "titleRequired") });
  }
  if (!body) {
    return res.status(400).json({ error: t(lang, "bodyRequired") });
  }
  const saved = await upsertInstruction({
    code: String(code),
    lang: normalizeLang(locale || lang),
    platform: platform ? String(platform) : "universal",
    title: String(title),
    body: String(body),
    imageUrl: imageUrl ? String(imageUrl) : null
  });
  return res.json({ message: t(lang, "instructionSaved"), instruction: saved });
});

app.post("/admin/plans", async (req, res) => {
  const lang = requestLang(req);
  const { id, name, days, trafficLimitBytes, isTrial = false } = req.body;
  if (!id || !name || !days) {
    return res.status(400).json({ error: "id, name, days are required" });
  }
  const plan = await upsertPlan({
    id: String(id),
    name: String(name),
    days: Number(days),
    trafficLimitBytes: trafficLimitBytes == null ? null : Number(trafficLimitBytes),
    isTrial: Boolean(isTrial)
  });
  await createAuditLog({ actor: "admin", action: "plan.upsert", target: `plan:${plan.id}`, after: plan });
  return res.json({ message: t(lang, "planSaved"), plan });
});

app.delete("/admin/plans/:id", async (req, res) => {
  const lang = requestLang(req);
  const before = await getPlan(req.params.id);
  await deletePlan(req.params.id);
  await createAuditLog({ actor: "admin", action: "plan.delete", target: `plan:${req.params.id}`, before });
  return res.json({ message: t(lang, "planDeleted") });
});

app.get("/admin/pasarguard/info", async (_req, res) => {
  const lang = requestLang(_req);
  const pasarCfg = await getPasarRuntimeConfig();
  if (!pasarCfg.nodeApiBaseUrl || !pasarCfg.apiKey) {
    return res.status(400).json({ error: t(lang, "pasarMissing") });
  }
  const info = await getBaseInfo(pasarCfg.nodeApiBaseUrl, pasarCfg.apiKey);
  return res.json({ info });
});

app.get("/admin/pasarguard/settings", async (_req, res) => {
  const saved = await getIntegrationSetting("pasarguard");
  return res.json({ data: saved?.value || null });
});

app.get("/admin/pasarguard/templates", async (_req, res) => {
  const cfgRuntime = await getPasarRuntimeConfig();
  if (!cfgRuntime.panelUrl || !cfgRuntime.username || !cfgRuntime.password) {
    return res.status(400).json({ error: "panel credentials are not configured" });
  }
  const token = await fetchAdminToken(cfgRuntime.panelUrl, cfgRuntime.username, cfgRuntime.password);
  const [templates, usersSimple] = await Promise.all([
    getUserTemplates(cfgRuntime.panelUrl, token),
    getUsersSimple(cfgRuntime.panelUrl, token)
  ]);
  return res.json({ templates, users: usersSimple?.users || [] });
});

app.get("/admin/pasarguard/panel_status", async (_req, res) => {
  const cfgRuntime = await getPasarRuntimeConfig();
  if (!cfgRuntime.panelUrl || !cfgRuntime.username || !cfgRuntime.password) {
    return res.json({ connected: false, reason: "missing_credentials" });
  }
  try {
    const token = await fetchAdminToken(cfgRuntime.panelUrl, cfgRuntime.username, cfgRuntime.password);
    const templates = await getUserTemplates(cfgRuntime.panelUrl, token);
    return res.json({ connected: true, templatesCount: (templates || []).length });
  } catch (error) {
    return res.json({ connected: false, reason: error.message });
  }
});

app.post("/admin/pasarguard/user_action", async (req, res) => {
  const { username, action, limits } = req.body;
  const runtime = await getPasarRuntimeConfig();
  if (!runtime.nodeApiBaseUrl || !runtime.apiKey) {
    return res.status(400).json({ error: "node api is not configured" });
  }
  if (!username || !action) {
    return res.status(400).json({ error: "username and action are required" });
  }
  if (action === "suspend") {
    await suspendUser(runtime.nodeApiBaseUrl, runtime.apiKey, username);
  } else if (action === "resume") {
    await resumeUser(runtime.nodeApiBaseUrl, runtime.apiKey, username);
  } else if (action === "delete") {
    await deleteUser(runtime.nodeApiBaseUrl, runtime.apiKey, username);
  } else if (action === "limits") {
    await updateUserLimits(runtime.nodeApiBaseUrl, runtime.apiKey, username, limits || {});
  } else {
    return res.status(400).json({ error: "unsupported action" });
  }
  await createAuditLog({ actor: "admin", action: `pasar.user.${action}`, target: `pasar:${username}`, meta: { limits } });
  return res.json({ ok: true });
});

app.post("/admin/pasarguard/reconcile", async (_req, res) => {
  const subscriptions = await listSubscriptions();
  const reconciled = [];
  for (const sub of subscriptions) {
    reconciled.push({ userId: sub.userId, remoteUsername: sub.remoteUsername, status: sub.status });
  }
  await createIncidentEvent({ level: "info", source: "pasarguard", message: "reconcile_completed", meta: { count: reconciled.length } });
  return res.json({ ok: true, reconciled });
});

app.post("/admin/pasarguard/connect", async (req, res) => {
  const lang = requestLang(req);
  const {
    panelUrl,
    nodeApiBaseUrl,
    subscriptionUrlPattern,
    username,
    password,
    apiKey: directApiKey,
    wlTemplateUser,
    noWlTemplateUser,
    wlInbounds,
    noWlInbounds,
    wlTemplateId,
    noWlTemplateId,
    trialTemplateId,
    wlTemplateName,
    noWlTemplateName,
    trialTemplateName
  } = req.body;

  let apiKey = directApiKey || "";
  let autoDetected = false;
  let detectedFrom = null;

  if (!apiKey && panelUrl && username && password) {
    const detection = await tryFetchApiKeyFromPanel(panelUrl, username, password);
    if (detection.ok) {
      apiKey = detection.apiKey;
      autoDetected = true;
      detectedFrom = detection.source;
    }
  }

  let resolvedWlTemplateId = wlTemplateId || null;
  let resolvedNoWlTemplateId = noWlTemplateId || null;
  let resolvedTrialTemplateId = trialTemplateId || null;

  if ((!resolvedWlTemplateId && wlTemplateName) || (!resolvedNoWlTemplateId && noWlTemplateName) || (!resolvedTrialTemplateId && trialTemplateName)) {
    try {
      const token = await fetchAdminToken(panelUrl, username, password);
      const templates = await getUserTemplates(panelUrl, token);
      const byName = new Map((templates || []).map((item) => [String(item.name || ""), item.id]));
      resolvedWlTemplateId = resolvedWlTemplateId || byName.get(String(wlTemplateName || "")) || null;
      resolvedNoWlTemplateId = resolvedNoWlTemplateId || byName.get(String(noWlTemplateName || "")) || null;
      resolvedTrialTemplateId = resolvedTrialTemplateId || byName.get(String(trialTemplateName || "")) || null;
    } catch (_error) {
      // keep unresolved values
    }
  }

  const payload = {
    panelUrl: panelUrl || null,
    nodeApiBaseUrl: nodeApiBaseUrl || null,
    subscriptionUrlPattern: subscriptionUrlPattern || null,
    username: username || null,
    password: password || null,
    apiKey: apiKey || null,
    wlTemplateUser: wlTemplateUser || null,
    noWlTemplateUser: noWlTemplateUser || null,
    wlInbounds: wlInbounds || null,
    noWlInbounds: noWlInbounds || null,
    wlTemplateId: resolvedWlTemplateId,
    noWlTemplateId: resolvedNoWlTemplateId,
    trialTemplateId: resolvedTrialTemplateId,
    wlTemplateName: wlTemplateName || null,
    noWlTemplateName: noWlTemplateName || null,
    trialTemplateName: trialTemplateName || null,
    autoDetected,
    detectedFrom
  };
  await setIntegrationSetting("pasarguard", payload);
  await createAuditLog({ actor: "admin", action: "pasarguard.connect", target: "integration:pasarguard", after: payload });
  return res.json({ message: t(lang, "instructionSaved"), data: payload });
});

app.post("/admin/subscriptions/reconcile", async (req, res) => {
  const lang = requestLang(req);
  const { userId, trafficUsedBytes } = req.body;
  const sub = await getSubscriptionByUserId(userId);
  if (!sub) {
    return res.status(404).json({ error: t(lang, "subscriptionNotFound") });
  }
  if (shouldBlockForTraffic(sub, Number(trafficUsedBytes || 0))) {
    sub.blocked = true;
    sub.status = "blocked";
    await upsertSubscription(sub);
  }
  res.json({ subscription: sub });
});

app.delete("/admin/subscriptions/:userId", async (req, res) => {
  const userId = req.params.userId;
  const sub = await getSubscriptionByUserId(userId);
  if (sub?.remoteUsername) {
    const pasarCfg = await getPasarRuntimeConfig();
    if (isPasarConnected(pasarCfg)) {
      const panelToken = await fetchAdminToken(pasarCfg.panelUrl, pasarCfg.username, pasarCfg.password);
      await deletePanelUser(pasarCfg.panelUrl, panelToken, sub.remoteUsername);
    }
  }
  await deleteSubscriptionByUserId(userId);
  await markUserTrialUnused(userId);
  await createAuditLog({ actor: "admin", action: "subscription.delete", target: `subscription:${userId}`, before: sub });
  return res.json({ ok: true });
});

app.get("/wallet/:telegramId", async (req, res) => {
  const user = await getOrCreateUser(String(req.params.telegramId));
  const balanceMinor = await getUserBalance(user.id);
  res.json({ telegramId: user.telegramId, balanceMinor, currency: "RUB" });
});

app.post("/wallet/topup", async (req, res) => {
  const { telegramId, amountMinor, source = "manual" } = req.body;
  const user = await getOrCreateUser(String(telegramId));
  const entry = await createBalanceEntry({
    userId: user.id,
    entryType: "topup",
    amountMinor: Number(amountMinor || 0),
    source
  });
  res.json({ ok: true, entry, balanceMinor: await getUserBalance(user.id) });
});

app.post("/orders/create", async (req, res) => {
  const { telegramId, profileId, idempotencyKey, promoCode } = req.body;
  if (!telegramId || !profileId) {
    return res.status(400).json({ error: "telegramId and profileId are required" });
  }
  const user = await getOrCreateUser(String(telegramId));
  const profile = await getSubscriptionProfile(profileId);
  if (!profile) {
    return res.status(404).json({ error: "profile_not_found" });
  }
  const promos = await listPromoCodes();
  const promo = promos.find((p) => p.code === promoCode && p.active);
  let amountMinor = Number(profile.priceMinor || 0);
  if (promo?.kind === "amount" && promo.valueMinor) {
    amountMinor = Math.max(0, amountMinor - Number(promo.valueMinor));
  }
  const order = await createSubscriptionOrder({
    userId: user.id,
    profileId: profile.id,
    status: "created",
    amountMinor,
    currency: profile.currency || "RUB",
    idempotencyKey
  });
  res.json({ ok: true, order, appliedPromo: promo || null });
});

app.get("/miniapp/catalog", async (_req, res) => {
  const profiles = await listSubscriptionProfiles();
  res.json({ profiles: profiles.filter((p) => p.active) });
});

app.post("/landing/checkout", async (req, res) => {
  const { telegramId, profileId, utm = {} } = req.body;
  const user = await getOrCreateUser(String(telegramId));
  const profile = await getSubscriptionProfile(profileId || "m1");
  if (!profile) {
    return res.status(404).json({ error: "profile_not_found" });
  }
  const order = await createSubscriptionOrder({
    userId: user.id,
    profileId: profile.id,
    status: "created",
    amountMinor: Number(profile.priceMinor || 0),
    currency: profile.currency || "RUB"
  });
  await createIncidentEvent({ level: "info", source: "landing", message: "checkout_created", meta: { orderId: order.id, utm } });
  res.json({ order });
});

app.post("/gifts/create", async (req, res) => {
  const { fromTelegramId, toTelegramId, profileId = "m1" } = req.body;
  const fromUser = await getOrCreateUser(String(fromTelegramId));
  const toUser = await getOrCreateUser(String(toTelegramId));
  const profile = await getSubscriptionProfile(profileId);
  if (!profile) {
    return res.status(404).json({ error: "profile_not_found" });
  }
  const order = await createSubscriptionOrder({
    userId: fromUser.id,
    profileId: profile.id,
    status: "gift_created",
    amountMinor: Number(profile.priceMinor || 0),
    currency: profile.currency || "RUB"
  });
  await createAuditLog({
    actor: `user:${fromUser.telegramId}`,
    action: "gift.create",
    target: `user:${toUser.telegramId}`,
    meta: { orderId: order.id, profileId }
  });
  res.json({ ok: true, giftOrder: order });
});

app.get("/admin/promos", async (_req, res) => {
  res.json({ data: await listPromoCodes() });
});

app.post("/admin/promos", async (req, res) => {
  const saved = await upsertPromoCode(req.body);
  await createAuditLog({ actor: "admin", action: "promo.upsert", target: `promo:${saved.code}`, after: saved });
  res.json({ promo: saved });
});

app.get("/admin/campaigns", async (_req, res) => {
  res.json({ data: await listCampaigns() });
});

app.post("/admin/campaigns", async (req, res) => {
  const saved = await upsertCampaign(req.body);
  await createAuditLog({ actor: "admin", action: "campaign.upsert", target: `campaign:${saved.id}`, after: saved });
  res.json({ campaign: saved });
});

app.post("/admin/broadcasts", async (req, res) => {
  const job = await createBroadcastJob({
    campaignId: req.body?.campaignId || null,
    status: "pending",
    payload: req.body?.payload || {}
  });
  res.json({ job });
});

app.get("/admin/broadcasts", async (req, res) => {
  res.json({ data: await listBroadcastJobs(Number(req.query.limit || 50)) });
});

app.get("/admin/channel-policies", async (_req, res) => {
  res.json({ data: await listChannelPolicies() });
});

app.post("/admin/channel-policies", async (req, res) => {
  const saved = await upsertChannelPolicy(req.body);
  await createAuditLog({ actor: "admin", action: "channel_policy.upsert", target: `policy:${saved.code}`, after: saved });
  res.json({ policy: saved });
});

app.get("/admin/incidents", async (req, res) => {
  res.json({ data: await listIncidentEvents(Number(req.query.limit || 100)) });
});

app.post("/admin/incidents", async (req, res) => {
  const event = await createIncidentEvent(req.body);
  res.json({ event });
});

app.get("/admin/analytics/summary", async (_req, res) => {
  const subscriptions = await listSubscriptions();
  const payments = await listPaymentEventsByUser((await listUsers())[0]?.id || "");
  const active = subscriptions.filter((s) => s.status === "active").length;
  const blocked = subscriptions.filter((s) => s.status === "blocked").length;
  res.json({
    mrrEstimateMinor: subscriptions.reduce((sum, s) => sum + (s.isTrial ? 0 : 49900), 0),
    activeSubscriptions: active,
    blockedSubscriptions: blocked,
    samplePayments: payments.length
  });
});

app.get("/admin/rbac/config", async (_req, res) => {
  const data = (await getIntegrationSetting("rbac"))?.value || {
    roles: [{ code: "owner", permissions: ["*"] }],
    permissions: []
  };
  res.json({ data });
});

app.post("/admin/rbac/config", async (req, res) => {
  const payload = req.body || {};
  await setIntegrationSetting("rbac", payload);
  await createAuditLog({ actor: "admin", action: "rbac.config", target: "rbac", after: payload });
  res.json({ ok: true, data: payload });
});

app.get("/admin/ops/maintenance", async (_req, res) => {
  const data = (await getIntegrationSetting("maintenance"))?.value || { enabled: false, message: "" };
  res.json({ data });
});

app.post("/admin/ops/maintenance", async (req, res) => {
  const payload = { enabled: Boolean(req.body?.enabled), message: String(req.body?.message || "") };
  await setIntegrationSetting("maintenance", payload);
  await createIncidentEvent({ level: "warning", source: "admin", message: "maintenance_updated", meta: payload });
  res.json({ ok: true, data: payload });
});

app.listen(cfg.port, () => {
  console.log(`API listening on :${cfg.port}`);
});
