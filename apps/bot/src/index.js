import TelegramBot from "node-telegram-bot-api";

const token = process.env.BOT_TOKEN;
const apiBase = process.env.APP_BASE_URL || "http://localhost:8080";

if (!token || token === "change_me") {
  console.log("BOT_TOKEN missing, bot is not started.");
  process.exit(0);
}

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const text = [
    "Welcome to Simple PasarBot.",
    "1) /trial - get a trial",
    "2) /cabinet - show subscription status",
    "3) /buy - create payment request"
  ].join("\n");
  await bot.sendMessage(msg.chat.id, text);
});

bot.onText(/\/trial/, async (msg) => {
  const response = await fetch(`${apiBase}/trial/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ telegramId: msg.from.id, channelMember: true, nodeTemplate: "no-whitelist" })
  });
  const payload = await response.json();
  await bot.sendMessage(msg.chat.id, JSON.stringify(payload, null, 2));
});

bot.onText(/\/cabinet/, async (msg) => {
  const response = await fetch(`${apiBase}/cabinet/${msg.from.id}`);
  const payload = await response.json();
  await bot.sendMessage(msg.chat.id, JSON.stringify(payload, null, 2));
});

bot.onText(/\/buy/, async (msg) => {
  const response = await fetch(`${apiBase}/payments/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: String(msg.from.id), planId: "monthly", amount: 499 })
  });
  const payload = await response.json();
  await bot.sendMessage(msg.chat.id, `Payment created: ${JSON.stringify(payload.payment)}`);
});
