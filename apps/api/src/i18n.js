const messages = {
  en: {
    invalidSignature: "invalid signature",
    telegramRequired: "telegramId is required",
    userIdRequired: "userId is required",
    codeRequired: "instruction code is required",
    titleRequired: "instruction title is required",
    bodyRequired: "instruction body is required",
    channelRequired: "channel subscription required",
    trialUsed: "trial already used",
    trialMissing: "trial plan is not configured",
    pasarMissing: "PasarGuard config missing",
    subscriptionNotFound: "subscription not found",
    languageUpdated: "language updated",
    instructionSaved: "instruction saved",
    trialStarted: "trial started successfully",
    cabinetLoaded: "cabinet loaded",
    paymentPrepared: "payment request prepared"
  },
  ru: {
    invalidSignature: "неверная подпись",
    telegramRequired: "нужно передать telegramId",
    userIdRequired: "нужно передать userId",
    codeRequired: "нужно передать код инструкции",
    titleRequired: "нужно передать заголовок инструкции",
    bodyRequired: "нужно передать текст инструкции",
    channelRequired: "нужна подписка на канал",
    trialUsed: "триал уже использован",
    trialMissing: "тариф триала не настроен",
    pasarMissing: "не настроен PasarGuard",
    subscriptionNotFound: "подписка не найдена",
    languageUpdated: "язык обновлен",
    instructionSaved: "инструкция сохранена",
    trialStarted: "триал успешно создан",
    cabinetLoaded: "кабинет загружен",
    paymentPrepared: "запрос на оплату подготовлен"
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
