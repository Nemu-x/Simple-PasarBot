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
  const response = await fetch(`${apiBase}/trial/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId: msg.from.id, channelMember: true, nodeTemplate: "no-whitelist", lang })
  });
  const payload = await response.json();
  await bot.sendMessage(msg.chat.id, JSON.stringify(payload, null, 2));
});

bot.onText(/\/cabinet/, async (msg) => {
  const lang = langForMessage(msg);
  const response = await fetch(`${apiBase}/cabinet/${msg.from.id}?lang=${lang}`);
  const payload = await response.json();
  await bot.sendMessage(msg.chat.id, JSON.stringify(payload, null, 2));
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
