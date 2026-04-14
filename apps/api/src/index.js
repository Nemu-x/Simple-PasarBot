import express from "express";
import {
  getOrCreateUser,
  getPlan,
  getSubscriptionByUserId,
  listPlans,
  listSubscriptions,
  setUser,
  upsertSubscription
} from "@simple-pasarbot/db";
import { canStartTrial, evaluateSubscription, shouldBlockForTraffic } from "@simple-pasarbot/domain";
import { getBaseInfo, syncUser } from "@simple-pasarbot/pasarguard";
import { buildPaymentRequest, verifyWebhookSignature } from "@simple-pasarbot/platega";

const app = express();
app.use(express.json());

const cfg = {
  port: Number(process.env.API_PORT || 8080),
  pasarguardBaseUrl: process.env.PASARGUARD_BASE_URL || "",
  pasarguardApiKey: process.env.PASARGUARD_API_KEY || "",
  webhookSecret: process.env.PLATEGA_WEBHOOK_SECRET || "dev-secret",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:8080"
};

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/plans", (_req, res) => {
  res.json({ plans: listPlans() });
});

app.post("/trial/start", async (req, res) => {
  const { telegramId, channelMember = true, nodeTemplate = "no-whitelist" } = req.body;
  if (!telegramId) {
    return res.status(400).json({ error: "telegramId is required" });
  }
  if (!channelMember) {
    return res.status(403).json({ error: "channel subscription required" });
  }

  const user = getOrCreateUser(telegramId);
  if (!canStartTrial(user)) {
    return res.status(409).json({ error: "trial already used" });
  }
  const trial = getPlan("trial");
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

  user.hasUsedTrial = true;
  setUser(user);
  upsertSubscription(subscription);

  if (cfg.pasarguardBaseUrl && cfg.pasarguardApiKey) {
    await syncUser(cfg.pasarguardBaseUrl, cfg.pasarguardApiKey, {
      email: `${user.telegramId}@trial.local`,
      inbounds: [nodeTemplate]
    }).catch(() => undefined);
  }

  return res.json({ subscription });
});

app.get("/cabinet/:telegramId", (req, res) => {
  const user = getOrCreateUser(req.params.telegramId);
  const subscription = getSubscriptionByUserId(user.id);
  const status = subscription ? evaluateSubscription(subscription) : "no_subscription";
  res.json({ user, subscription, status });
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

app.post("/payments/webhook", express.raw({ type: "*/*" }), (req, res) => {
  const signature = req.headers["x-signature"];
  const rawBody = req.body.toString("utf8");
  if (!verifyWebhookSignature(rawBody, String(signature || ""), cfg.webhookSecret)) {
    return res.status(401).json({ error: "invalid signature" });
  }
  const event = JSON.parse(rawBody);
  if (event.status === "paid") {
    const sub = getSubscriptionByUserId(event.userId);
    if (sub) {
      sub.blocked = false;
      sub.status = "active";
      sub.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      upsertSubscription(sub);
    }
  }
  return res.json({ ok: true });
});

app.get("/admin/subscriptions", (_req, res) => {
  res.json({ data: listSubscriptions() });
});

app.get("/admin/pasarguard/info", async (_req, res) => {
  if (!cfg.pasarguardBaseUrl || !cfg.pasarguardApiKey) {
    return res.status(400).json({ error: "PasarGuard config missing" });
  }
  const info = await getBaseInfo(cfg.pasarguardBaseUrl, cfg.pasarguardApiKey);
  return res.json({ info });
});

app.post("/admin/subscriptions/reconcile", (req, res) => {
  const { userId, trafficUsedBytes } = req.body;
  const sub = getSubscriptionByUserId(userId);
  if (!sub) {
    return res.status(404).json({ error: "subscription not found" });
  }
  if (shouldBlockForTraffic(sub, Number(trafficUsedBytes || 0))) {
    sub.blocked = true;
    sub.status = "blocked";
    upsertSubscription(sub);
  }
  res.json({ subscription: sub });
});

app.listen(cfg.port, () => {
  console.log(`API listening on :${cfg.port}`);
});
