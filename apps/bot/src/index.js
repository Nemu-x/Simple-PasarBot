import TelegramBot from "node-telegram-bot-api";
import { detectLang, normalizeLang, t } from "./i18n.js";

const token = process.env.BOT_TOKEN;
const apiBase = process.env.API_INTERNAL_URL || process.env.APP_BASE_URL || "http://localhost:8080";
const userLangCache = new Map();

if (!token || token === "change_me") {
  console.log("BOT_TOKEN missing, bot is not started.");
  process.exit(0);
}

const bot = new TelegramBot(token, { polling: true });
const instructionPlatforms = ["universal", "ios", "android", "mac", "win"];

function langForMessage(msg) {
  const id = String(msg.from.id);
  return userLangCache.get(id) || detectLang(msg);
}

async function saveLanguage(telegramId, lang) {
  await fetch(`${apiBase}/users/language`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId: String(telegramId), lang })
  }).catch(() => undefined);
}

function dataUrlToBuffer(dataUrl) {
  const parts = String(dataUrl).split(",");
  if (parts.length < 2) {
    return null;
  }
  return Buffer.from(parts[1], "base64");
}

async function sendInstruction(chatId, lang, payload) {
  const subscriptionUrl = payload?.subscription?.subscriptionUrl;
  const instruction = payload?.instruction;
  const blocks = [t(lang, "instructionTitle")];
  if (instruction) {
    blocks.push(`${instruction.title}\n${instruction.body}`);
  } else {
    blocks.push(t(lang, "instructionMissing"));
  }
  if (subscriptionUrl) {
    blocks.push(`${t(lang, "subscriptionUrl")} ${subscriptionUrl}`);
  }
  await bot.sendMessage(chatId, blocks.join("\n\n"));

  if (payload?.qrDataUrl) {
    const image = dataUrlToBuffer(payload.qrDataUrl);
    if (image) {
      await bot.sendPhoto(chatId, image, { caption: t(lang, "qrCaption") });
    }
  }
}

function instructionKeyboard(lang) {
  const labels = t(lang, "platforms");
  return {
    inline_keyboard: instructionPlatforms.map((platform) => [
      {
        text: labels[platform],
        callback_data: `instruction:${platform}`
      }
    ])
  };
}

async function sendInstructionByPlatform(chatId, telegramId, languageCode, platform) {
  const lang = normalizeLang(languageCode);
  const response = await fetch(`${apiBase}/cabinet/${telegramId}?lang=${lang}&platform=${platform}`);
  const payload = await response.json();
  await sendInstruction(chatId, lang, payload);
}

function mainKeyboard(lang) {
  return {
    keyboard: [
      [t(lang, "menuTrial"), t(lang, "menuCabinet")],
      [t(lang, "menuBuy"), t(lang, "menuInstructions")],
      [t(lang, "menuWallet"), t(lang, "menuPromo")],
      [t(lang, "menuReferral"), t(lang, "menuSupport")],
      [t(lang, "menuLanguage")]
    ],
    resize_keyboard: true
  };
}

function onboardingKeyboard(lang) {
  const a = t(lang, "actions");
  return {
    inline_keyboard: [
      [{ text: a.startTrial, callback_data: "flow:trial" }],
      [{ text: a.openPlans, callback_data: "flow:plans" }],
      [{ text: a.openCabinet, callback_data: "flow:cabinet" }],
      [{ text: a.instructions, callback_data: "flow:instructions" }]
    ]
  };
}

function checkChannelKeyboard(lang) {
  return {
    inline_keyboard: [[{ text: t(lang, "checkSubscription"), callback_data: "check:channel" }]]
  };
}

function plansKeyboard(lang, plans) {
  const rows = (plans || [])
    .filter((p) => !p.isTrial)
    .map((p) => [{ text: `${p.name} (${p.days}d)`, callback_data: `buy:${p.id}` }]);
  if (!rows.length) {
    rows.push([{ text: t(lang, "emptyPlans"), callback_data: "noop" }]);
  }
  rows.push([{ text: t(lang, "actions").startTrial, callback_data: "flow:trial" }]);
  return { inline_keyboard: rows };
}

function resolveActionFromText(text, lang) {
  const value = String(text || "").trim();
  if (value === t(lang, "menuTrial")) return "trial";
  if (value === t(lang, "menuCabinet")) return "cabinet";
  if (value === t(lang, "menuBuy")) return "buy";
  if (value === t(lang, "menuInstructions")) return "instructions";
  if (value === t(lang, "menuLanguage")) return "language";
  if (value === t(lang, "menuWallet")) return "wallet";
  if (value === t(lang, "menuPromo")) return "promo";
  if (value === t(lang, "menuReferral")) return "referral";
  if (value === t(lang, "menuSupport")) return "support";
  return null;
}

function languageKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "English", callback_data: "lang:en" }],
      [{ text: "Русский", callback_data: "lang:ru" }]
    ]
  };
}

async function handleTrial(msg) {
  const lang = langForMessage(msg);
  try {
    const response = await fetch(`${apiBase}/trial/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramId: msg.from.id,
        channelMember: true,
        nodeTemplate: "no-whitelist",
        lang,
        platform: "universal"
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      const errorText = payload?.error || t(lang, "apiError");
      if (String(errorText).toLowerCase().includes("channel")) {
        await bot.sendMessage(msg.chat.id, `${t(lang, "channelCheckPrompt")}\n${errorText}`, {
          reply_markup: checkChannelKeyboard(lang)
        });
        return;
      }
      await bot.sendMessage(msg.chat.id, errorText);
      return;
    }
    await bot.sendMessage(msg.chat.id, payload?.message || t(lang, "trialCreated"));
    await sendInstruction(msg.chat.id, lang, payload);
  } catch (_error) {
    await bot.sendMessage(msg.chat.id, t(lang, "apiError"));
  }
}

async function handleCabinet(msg) {
  const lang = langForMessage(msg);
  try {
    const response = await fetch(`${apiBase}/cabinet/${msg.from.id}?lang=${lang}&platform=universal`);
    const payload = await response.json();
    const summary = [
      t(lang, "cabinetTitle"),
      `${t(lang, "statusLabel")}: ${payload.status || "-"}`,
      `${t(lang, "planLabel")}: ${payload.subscription?.planId || "-"}`,
      `${t(lang, "expiresLabel")}: ${payload.subscription?.expiresAt || "-"}`
    ].join("\n");
    await bot.sendMessage(msg.chat.id, summary);
    await sendInstruction(msg.chat.id, lang, payload);
  } catch (_error) {
    await bot.sendMessage(msg.chat.id, t(lang, "apiError"));
  }
}

async function handleBuy(msg) {
  const lang = langForMessage(msg);
  const response = await fetch(`${apiBase}/profiles`);
  const payload = await response.json().catch(() => ({}));
  const profiles = payload?.profiles || [];
  await bot.sendMessage(msg.chat.id, t(lang, "plansTitle"), {
    reply_markup: plansKeyboard(lang, profiles)
  });
}

async function handleInstructions(msg) {
  const lang = langForMessage(msg);
  await bot.sendMessage(msg.chat.id, t(lang, "choosePlatform"), {
    reply_markup: instructionKeyboard(lang)
  });
}

async function handleWallet(msg) {
  const lang = langForMessage(msg);
  const response = await fetch(`${apiBase}/wallet/${msg.from.id}`);
  const payload = await response.json().catch(() => ({}));
  await bot.sendMessage(msg.chat.id, `${t(lang, "walletBalance")}: ${(payload.balanceMinor || 0) / 100} ${payload.currency || "RUB"}`);
}

async function handleReferral(msg) {
  const lang = langForMessage(msg);
  await bot.sendMessage(msg.chat.id, `${t(lang, "menuReferral")}: https://t.me/${(await bot.getMe()).username}?start=ref_${msg.from.id}`);
}

async function handlePromo(msg) {
  const lang = langForMessage(msg);
  await bot.sendMessage(msg.chat.id, `${t(lang, "menuPromo")}: /promo CODE`);
}

async function createOrderForPlan(chatId, telegramId, lang, profileId) {
  const orderResponse = await fetch(`${apiBase}/orders/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId: String(telegramId), profileId })
  });
  const orderPayload = await orderResponse.json().catch(() => ({}));
  if (!orderResponse.ok) {
    await bot.sendMessage(chatId, orderPayload?.error || t(lang, "apiError"));
    return;
  }
  const paymentResp = await fetch(`${apiBase}/payments/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: String(telegramId),
      planId: profileId,
      amount: Number(orderPayload?.order?.amountMinor || 0) / 100,
      lang
    })
  });
  const paymentPayload = await paymentResp.json().catch(() => ({}));
  await bot.sendMessage(chatId, `${t(lang, "orderCreated")}: ${profileId}\n${t(lang, "paymentCreated")} ${JSON.stringify(paymentPayload.payment || {})}`);
}

bot.onText(/\/start/, async (msg) => {
  const detected = detectLang(msg);
  const telegramId = String(msg.from.id);
  userLangCache.set(telegramId, detected);
  await saveLanguage(telegramId, detected);
  const lang = langForMessage(msg);
  await bot.sendMessage(msg.chat.id, t(lang, "chooseLanguage"), { reply_markup: languageKeyboard() });
  await bot.sendMessage(msg.chat.id, `${t(lang, "onboardingTitle")}\n${t(lang, "startHint")}`, { reply_markup: mainKeyboard(lang) });
});

bot.onText(/\/menu/, async (msg) => {
  const lang = langForMessage(msg);
  await saveLanguage(msg.from.id, lang);
  await bot.sendMessage(msg.chat.id, t(lang, "welcome"), { reply_markup: mainKeyboard(lang) });
});

bot.onText(/\/lang(?:\s+(\w+))?/, async (msg, match) => {
  const maybeLang = normalizeLang(match?.[1]);
  if (!match?.[1]) {
    await bot.sendMessage(msg.chat.id, t(langForMessage(msg), "langHelp"));
    return;
  }
  const telegramId = String(msg.from.id);
  userLangCache.set(telegramId, maybeLang);
  await saveLanguage(telegramId, maybeLang);
  await bot.sendMessage(msg.chat.id, t(maybeLang, "languageChanged"));
});

bot.onText(/\/trial/, async (msg) => {
  await handleTrial(msg);
});

bot.onText(/\/cabinet/, async (msg) => {
  await handleCabinet(msg);
});

bot.onText(/\/instructions/, async (msg) => {
  await handleInstructions(msg);
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) {
    return;
  }
  const lang = langForMessage(msg);
  const action = resolveActionFromText(msg.text, lang);
  if (action === "trial") {
    await handleTrial(msg);
  } else if (action === "cabinet") {
    await handleCabinet(msg);
  } else if (action === "buy") {
    await handleBuy(msg);
  } else if (action === "instructions") {
    await handleInstructions(msg);
  } else if (action === "wallet") {
    await handleWallet(msg);
  } else if (action === "promo") {
    await handlePromo(msg);
  } else if (action === "referral") {
    await handleReferral(msg);
  } else if (action === "support") {
    await bot.sendMessage(msg.chat.id, t(lang, "supportText"));
  } else if (action === "language") {
    await bot.sendMessage(msg.chat.id, t(lang, "chooseLanguage"), { reply_markup: languageKeyboard() });
  }
});

bot.on("callback_query", async (query) => {
  const data = query.data || "";
  if (!data.startsWith("instruction:")) {
    if (data.startsWith("lang:")) {
      const chosen = normalizeLang(data.split(":")[1]);
      userLangCache.set(String(query.from.id), chosen);
      await saveLanguage(query.from.id, chosen);
      await bot.sendMessage(query.message.chat.id, t(chosen, "languageChanged"), {
        reply_markup: mainKeyboard(chosen)
      });
      await bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith("flow:")) {
      const action = data.split(":")[1];
      const msg = { from: query.from, chat: query.message.chat };
      if (action === "trial") await handleTrial(msg);
      if (action === "plans") await handleBuy(msg);
      if (action === "cabinet") await handleCabinet(msg);
      if (action === "instructions") await handleInstructions(msg);
      await bot.answerCallbackQuery(query.id);
    }
    if (data === "check:channel") {
      const lang = normalizeLang(query.from.language_code);
      const response = await fetch(`${apiBase}/channel/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telegramId: String(query.from.id), lang })
      });
      const payload = await response.json().catch(() => ({}));
      if (payload.member) {
        await bot.sendMessage(query.message.chat.id, t(lang, "subscriptionOk"));
      } else {
        const channel = payload.channel ? ` (${payload.channel})` : "";
        await bot.sendMessage(query.message.chat.id, `${t(lang, "subscriptionMissing")}${channel}`);
      }
      await bot.answerCallbackQuery(query.id);
    }
    if (data.startsWith("buy:")) {
      const planId = data.split(":")[1];
      const lang = normalizeLang(query.from.language_code);
      await createOrderForPlan(query.message.chat.id, query.from.id, lang, planId);
      await bot.answerCallbackQuery(query.id);
    }
    if (data === "noop") {
      await bot.answerCallbackQuery(query.id);
    }
    return;
  }
  const platform = data.split(":")[1] || "universal";
  try {
    await sendInstructionByPlatform(query.message.chat.id, query.from.id, query.from.language_code, platform);
  } catch (_error) {
    await bot.sendMessage(query.message.chat.id, t(normalizeLang(query.from.language_code), "apiError"));
  } finally {
    await bot.answerCallbackQuery(query.id);
  }
});

bot.onText(/\/buy/, async (msg) => {
  await handleBuy(msg);
});

bot.onText(/\/plans/, async (msg) => {
  await handleBuy(msg);
});

bot.onText(/\/promo(?:\s+(\S+))?/, async (msg, match) => {
  const code = match?.[1];
  const lang = langForMessage(msg);
  if (!code) {
    await bot.sendMessage(msg.chat.id, `${t(lang, "menuPromo")}: /promo CODE`);
    return;
  }
  const payload = await fetch(`${apiBase}/orders/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId: String(msg.from.id), profileId: "m1", promoCode: code })
  }).then((r) => r.json())
    .catch(() => ({}));
  await bot.sendMessage(msg.chat.id, `${t(lang, "menuPromo")}: ${payload.appliedPromo ? t(lang, "promoApplied") : t(lang, "promoInvalid")}`);
});
