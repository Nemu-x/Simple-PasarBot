const dict = {
  en: {
    welcome: "Choose an action from buttons.",
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
    menuLanguage: "Language",
    chooseLanguage: "Choose language:",
    platforms: {
      universal: "Universal",
      ios: "iOS",
      android: "Android",
      mac: "macOS",
      win: "Windows"
    }
  },
  ru: {
    welcome: "Выберите действие кнопками ниже.",
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
    menuLanguage: "Язык",
    chooseLanguage: "Выберите язык:",
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
