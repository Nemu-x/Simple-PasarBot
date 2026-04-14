const messages = {
  en: {
    invalidSignature: "invalid signature",
    telegramRequired: "telegramId is required",
    channelRequired: "channel subscription required",
    trialUsed: "trial already used",
    trialMissing: "trial plan is not configured",
    pasarMissing: "PasarGuard config missing",
    subscriptionNotFound: "subscription not found",
    languageUpdated: "language updated"
  },
  ru: {
    invalidSignature: "неверная подпись",
    telegramRequired: "нужно передать telegramId",
    channelRequired: "нужна подписка на канал",
    trialUsed: "триал уже использован",
    trialMissing: "тариф триала не настроен",
    pasarMissing: "не настроен PasarGuard",
    subscriptionNotFound: "подписка не найдена",
    languageUpdated: "язык обновлен"
  }
};

export function normalizeLang(value) {
  if (!value) {
    return "en";
  }
  const lower = String(value).toLowerCase();
  return lower.startsWith("ru") ? "ru" : "en";
}

export function requestLang(req, fallback = "en") {
  return normalizeLang(req.query.lang || req.headers["x-lang"] || req.body?.lang || fallback);
}

export function t(lang, key) {
  return messages[lang]?.[key] || messages.en[key] || key;
}
