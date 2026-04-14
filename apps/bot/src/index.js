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

bot.onText(/\/start/, async (msg) => {
  const lang = langForMessage(msg);
  await saveLanguage(msg.from.id, lang);
  await bot.sendMessage(msg.chat.id, t(lang, "welcome"));
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
    await bot.sendMessage(msg.chat.id, payload?.message || t(lang, "trialCreated"));
    await sendInstruction(msg.chat.id, lang, payload);
  } catch (_error) {
    await bot.sendMessage(msg.chat.id, t(lang, "apiError"));
  }
});

bot.onText(/\/cabinet/, async (msg) => {
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
});

bot.onText(/\/instructions/, async (msg) => {
  const lang = langForMessage(msg);
  await bot.sendMessage(msg.chat.id, t(lang, "choosePlatform"), {
    reply_markup: instructionKeyboard(lang)
  });
});

bot.on("callback_query", async (query) => {
  const data = query.data || "";
  if (!data.startsWith("instruction:")) {
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
  const lang = langForMessage(msg);
  const response = await fetch(`${apiBase}/payments/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: String(msg.from.id), planId: "monthly", amount: 499, lang })
  });
  const payload = await response.json();
  await bot.sendMessage(msg.chat.id, `${t(lang, "paymentCreated")} ${JSON.stringify(payload.payment)}`);
});
