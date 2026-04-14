const dict = {
  en: {
    welcome: "Welcome to Simple PasarBot.\n1) /trial - get a trial\n2) /cabinet - show subscription status\n3) /buy - create payment request\n4) /instructions - choose client guide\n5) /lang ru|en - switch language",
    languageChanged: "Language changed to English.",
    langHelp: "Use /lang ru or /lang en",
    paymentCreated: "Payment created:",
    trialCreated: "Trial issued successfully.",
    cabinetTitle: "Your cabinet:",
    instructionTitle: "Connection instruction:",
    instructionMissing: "Instruction is not configured yet.",
    subscriptionUrl: "Subscription URL:",
    qrCaption: "QR to import subscription URL",
    apiError: "Request failed, try again in a moment.",
    statusLabel: "Status",
    planLabel: "Plan",
    expiresLabel: "Expires",
    choosePlatform: "Choose your client platform:",
    menuTrial: "Start Trial",
    menuCabinet: "My Cabinet",
    menuBuy: "Buy",
    menuInstructions: "Instructions",
    platforms: {
      universal: "Universal",
      ios: "iOS",
      android: "Android",
      mac: "macOS",
      win: "Windows"
    }
  },
  ru: {
    welcome: "Добро пожаловать в Simple PasarBot.\n1) /trial - получить триал\n2) /cabinet - статус подписки\n3) /buy - создать оплату\n4) /instructions - выбрать инструкцию\n5) /lang ru|en - сменить язык",
    languageChanged: "Язык переключен на русский.",
    langHelp: "Используй /lang ru или /lang en",
    paymentCreated: "Платеж создан:",
    trialCreated: "Триал успешно выдан.",
    cabinetTitle: "Ваш кабинет:",
    instructionTitle: "Инструкция подключения:",
    instructionMissing: "Инструкция пока не настроена.",
    subscriptionUrl: "Ссылка подписки:",
    qrCaption: "QR для импорта ссылки подписки",
    apiError: "Ошибка запроса, попробуйте чуть позже.",
    statusLabel: "Статус",
    planLabel: "Тариф",
    expiresLabel: "Истекает",
    choosePlatform: "Выберите платформу клиента:",
    menuTrial: "Старт триала",
    menuCabinet: "Мой кабинет",
    menuBuy: "Купить",
    menuInstructions: "Инструкции",
    platforms: {
      universal: "Универсально",
      ios: "iOS",
      android: "Android",
      mac: "macOS",
      win: "Windows"
    }
  }
};

export function detectLang(msg) {
  const code = msg?.from?.language_code || "en";
  return String(code).toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function normalizeLang(value) {
  if (!value) {
    return "en";
  }
  return String(value).toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function t(lang, key) {
  return dict[lang]?.[key] || dict.en[key] || key;
}
