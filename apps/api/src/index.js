import express from "express";
import QRCode from "qrcode";
import {
  deletePlan,
  deleteSubscriptionByUserId,
  getOrCreateUser,
  getInstruction,
  getIntegrationSetting,
  getPlan,
  getSubscriptionByUserId,
  healthCheck,
  listInstructions,
  listPlans,
  listSubscriptions,
  listUsers,
  markUserTrialUsed,
  markUserTrialUnused,
  setUserPreferredLanguage,
  setIntegrationSetting,
  upsertPlan,
  upsertInstruction,
  upsertSubscription
} from "@simple-pasarbot/db";
import { canStartTrial, evaluateSubscription, shouldBlockForTraffic } from "@simple-pasarbot/domain";
import { getBaseInfo, syncUser } from "@simple-pasarbot/pasarguard";
import { buildPaymentRequest, createInvoice, verifyWebhookSignature } from "@simple-pasarbot/platega";
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

const cfg = {
  port: Number(process.env.API_PORT || 8080),
  pasarguardBaseUrl: process.env.PASARGUARD_BASE_URL || "",
  pasarguardApiKey: process.env.PASARGUARD_API_KEY || "",
  webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || process.env.PLATEGA_WEBHOOK_SECRET || "dev-secret",
  appBaseUrl: process.env.APP_BASE_URL || "http://localhost:8080",
  paymentProvider: process.env.PAYMENT_PROVIDER_NAME || "Payment",
  paymentApiKey: process.env.PAYMENT_API_KEY || process.env.PLATEGA_API_KEY || ""
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
  const { telegramId, channelMember = true, nodeTemplate = "no-whitelist", platform = "universal" } = req.body;
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
  const pasarCfg = await getPasarRuntimeConfig();
  const templateKey = normalizeTemplateKey(nodeTemplate);
  const templateInbounds = templateKey === "wl" ? pasarCfg.wlInbounds : pasarCfg.noWlInbounds;
  const generatedEmail = `tg${user.telegramId}_${Date.now()}`;
  const generatedSubscriptionUrl = pasarCfg.subscriptionUrlPattern
    ? interpolateTemplate(pasarCfg.subscriptionUrlPattern, {
        email: generatedEmail,
        telegramId: user.telegramId,
        template: templateKey
      })
    : buildSubscriptionUrl(`${user.id}-trial`);

  const subscription = {
    id: `${user.id}-trial`,
    userId: user.id,
    planId: trial.id,
    status: "trial",
    isTrial: true,
    blocked: false,
    trafficUsedBytes: 0,
    trafficLimitBytes: trial.trafficLimitBytes,
    nodeId: templateKey,
    subscriptionUrl: generatedSubscriptionUrl,
    startsAt: startsAt.toISOString(),
    expiresAt: expiresAt.toISOString()
  };

  await markUserTrialUsed(user.id);
  let saved = await upsertSubscription(subscription);

  // Preferred flow: create user via PasarGuard panel template API and use returned subscription_url.
  const selectedTemplateId = pickTemplateId(pasarCfg, templateKey);
  if (isPasarConnected(pasarCfg) && !selectedTemplateId) {
    return res.status(400).json({ error: "PasarGuard template is not configured for trial flow" });
  }

  if (isPasarConnected(pasarCfg) && selectedTemplateId) {
    try {
      const panelToken = await fetchAdminToken(pasarCfg.panelUrl, pasarCfg.username, pasarCfg.password);
      const created = await createUserFromTemplate(pasarCfg.panelUrl, panelToken, {
        templateId: selectedTemplateId,
        username: generatedEmail,
        note: `telegram:${user.telegramId}`
      });
      if (created?.subscription_url) {
        saved = await upsertSubscription({
          ...saved,
          subscriptionUrl: created.subscription_url,
          remoteUsername: created.username || generatedEmail
        });
      } else {
        return res.status(502).json({ error: "PasarGuard user created without subscription URL" });
      }
    } catch (error) {
      return res.status(502).json({ error: `PasarGuard create failed: ${error.message}` });
    }
  }

  if (pasarCfg.nodeApiBaseUrl && pasarCfg.apiKey) {
    await syncUser(pasarCfg.nodeApiBaseUrl, pasarCfg.apiKey, {
      email: generatedEmail,
      inbounds: templateInbounds.length ? templateInbounds : [templateKey]
    }).catch(() => undefined);
  }

  const bundle = await instructionBundle(lang, saved.subscriptionUrl, String(platform));
  return res.json({
    message: t(lang, "trialStarted"),
    subscription: saved,
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
  const { userId, planId, amount } = req.body;
  if (!userId) {
    return res.status(400).json({ error: t(lang, "userIdRequired") });
  }
  const payload = buildPaymentRequest({
    userId,
    planId,
    amount,
    callbackUrl: `${cfg.appBaseUrl}/payments/webhook`
  });
  let invoice = null;
  if (cfg.paymentApiKey) {
    invoice = await createInvoice(cfg.paymentApiKey, payload).catch(() => null);
  }
  res.json({ message: t(lang, "paymentPrepared"), provider: cfg.paymentProvider, payment: payload, invoice });
});

app.get("/admin/subscriptions", async (_req, res) => {
  res.json({ data: await listSubscriptions() });
});

app.get("/admin/users", async (_req, res) => {
  res.json({ data: await listUsers() });
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
  return res.json({ message: t(lang, "planSaved"), plan });
});

app.delete("/admin/plans/:id", async (req, res) => {
  const lang = requestLang(req);
  await deletePlan(req.params.id);
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
  return res.json({ ok: true });
});

app.listen(cfg.port, () => {
  console.log(`API listening on :${cfg.port}`);
});
