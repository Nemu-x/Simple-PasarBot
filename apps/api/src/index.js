import express from "express";
import {
  getOrCreateUser,
  getPlan,
  getSubscriptionByUserId,
  healthCheck,
  listPlans,
  listSubscriptions,
  markUserTrialUsed,
  setUserPreferredLanguage,
  upsertSubscription
} from "@simple-pasarbot/db";
import { canStartTrial, evaluateSubscription, shouldBlockForTraffic } from "@simple-pasarbot/domain";
import { getBaseInfo, syncUser } from "@simple-pasarbot/pasarguard";
import { buildPaymentRequest, verifyWebhookSignature } from "@simple-pasarbot/platega";
import { normalizeLang, requestLang, t } from "./i18n.js";

const app = express();

const cfg = {
  port: Number(process.env.API_PORT || 8080),
  pasarguardBaseUrl: process.env.PASARGUARD_BASE_URL || "",
  pasarguardApiKey: process.env.PASARGUARD_API_KEY || "",
  webhookSecret: process.env.PLATEGA_WEBHOOK_SECRET || "dev-secret",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:8080"
};

app.get("/health", (_req, res) => {
  healthCheck()
    .then(() => res.json({ ok: true }))
    .catch((error) => res.status(500).json({ ok: false, error: error.message }));
});

app.post("/payments/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  const lang = normalizeLang(req.headers["x-lang"]);
  const signature = req.headers["x-signature"];
  const rawBody = req.body.toString("utf8");
  if (!verifyWebhookSignature(rawBody, String(signature || ""), cfg.webhookSecret)) {
    return res.status(401).json({ error: t(lang, "invalidSignature") });
  }

  const event = JSON.parse(rawBody);
  if (event.status === "paid") {
    const sub = await getSubscriptionByUserId(event.userId);
    if (sub) {
      sub.blocked = false;
      sub.status = "active";
      sub.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await upsertSubscription(sub);
    }
  }
  return res.json({ ok: true });
});

app.use(express.json());

app.get("/plans", async (_req, res) => {
  res.json({ plans: await listPlans() });
});

app.post("/trial/start", async (req, res) => {
  const lang = requestLang(req);
  const { telegramId, channelMember = true, nodeTemplate = "no-whitelist" } = req.body;
  if (!telegramId) {
    return res.status(400).json({ error: t(lang, "telegramRequired") });
  }
  if (!channelMember) {
    return res.status(403).json({ error: t(lang, "channelRequired") });
  }

  const user = await getOrCreateUser(telegramId);
  if (!canStartTrial(user)) {
    return res.status(409).json({ error: t(lang, "trialUsed") });
  }
  const trial = await getPlan("trial");
  if (!trial) {
    return res.status(500).json({ error: t(lang, "trialMissing") });
  }
  const startsAt = new Date();
  const expiresAt = new Date(startsAt.getTime() + trial.days * 24 * 60 * 60 * 1000);
  const subscription = {
    id: `${user.id}-trial`,
    userId: user.id,
    planId: trial.id,
    status: "trial",
    isTrial: true,
    blocked: false,
    trafficUsedBytes: 0,
    trafficLimitBytes: trial.trafficLimitBytes,
    nodeId: nodeTemplate,
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  await markUserTrialUsed(user.id);
  const saved = await upsertSubscription(subscription);

  if (cfg.pasarguardBaseUrl && cfg.pasarguardApiKey) {
    await syncUser(cfg.pasarguardBaseUrl, cfg.pasarguardApiKey, {
      email: `${user.telegramId}@trial.local`,
      inbounds: [nodeTemplate]
    }).catch(() => undefined);
  }

  return res.json({ subscription: saved });
});

app.get("/cabinet/:telegramId", async (req, res) => {
  const user = await getOrCreateUser(req.params.telegramId);
  const subscription = await getSubscriptionByUserId(user.id);
  const status = subscription ? evaluateSubscription(subscription) : "no_subscription";
  res.json({ user, subscription, status });
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

app.post("/payments/create", (req, res) => {
  const { userId, planId, amount } = req.body;
  const payload = buildPaymentRequest({
    userId,
    planId,
    amount,
    callbackUrl: `${cfg.appBaseUrl}/payments/webhook`
  });
  res.json({ payment: payload });
});

app.get("/admin/subscriptions", async (_req, res) => {
  res.json({ data: await listSubscriptions() });
});

app.get("/admin/pasarguard/info", async (_req, res) => {
  const lang = requestLang(_req);
  if (!cfg.pasarguardBaseUrl || !cfg.pasarguardApiKey) {
    return res.status(400).json({ error: t(lang, "pasarMissing") });
  }
  const info = await getBaseInfo(cfg.pasarguardBaseUrl, cfg.pasarguardApiKey);
  return res.json({ info });
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

app.listen(cfg.port, () => {
  console.log(`API listening on :${cfg.port}`);
});
