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
    menuTrial: "🚀 Start Trial",
    menuCabinet: "👤 My Cabinet",
    menuBuy: "💳 Buy",
    menuInstructions: "📚 Instructions",
    menuLanguage: "🌐 Language",
    menuWallet: "💰 Wallet",
    menuReferral: "🎁 Referral",
    menuPromo: "🏷 Promo",
    menuSupport: "🛟 Support",
    chooseLanguage: "Choose language:",
    autoLanguageNotice: "Using your Telegram language by default. You can change it anytime.",
    onboardingTitle: "Welcome to Nemu-X-PasarBot.",
    onboardingHint: "Choose what you want to do:",
    plansTitle: "Choose a plan:",
    emptyPlans: "Plans are not configured yet.",
    orderCreated: "Order created",
    walletBalance: "Current balance",
    promoApplied: "Promo applied",
    promoInvalid: "Promo is invalid",
    supportText: "Support: @support",
    channelCheckPrompt: "Channel subscription is required before trial.",
    checkSubscription: "Check subscription",
    subscriptionOk: "Subscription check passed. You can start trial.",
    subscriptionMissing: "Still not subscribed to channel",
    startHint: "Use buttons below to continue.",
    actions: {
      openCabinet: "Open cabinet",
      openPlans: "Plans and purchase",
      startTrial: "Start trial",
      renewM1: "Renew 1 month",
      renewM3: "Renew 3 months",
      renewM6: "Renew 6 months",
      renewM12: "Renew 12 months",
      instructions: "Open instructions"
    },
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
    menuTrial: "🚀 Старт триала",
    menuCabinet: "👤 Мой кабинет",
    menuBuy: "💳 Купить",
    menuInstructions: "📚 Инструкции",
    menuLanguage: "🌐 Язык",
    chooseLanguage: "Выберите язык:",
    menuWallet: "💰 Кошелек",
    menuReferral: "🎁 Рефералка",
    menuPromo: "🏷 Промокод",
    menuSupport: "🛟 Поддержка",
    autoLanguageNotice: "По умолчанию использую язык Telegram. Можно сменить в любой момент.",
    onboardingTitle: "Добро пожаловать в Nemu-X-PasarBot.",
    onboardingHint: "Выберите, что хотите сделать:",
    plansTitle: "Выберите тариф:",
    emptyPlans: "Тарифы пока не настроены.",
    orderCreated: "Заказ создан",
    walletBalance: "Текущий баланс",
    promoApplied: "Промокод применён",
    promoInvalid: "Промокод невалидный",
    supportText: "Поддержка: @support",
    channelCheckPrompt: "Перед триалом нужна подписка на канал.",
    checkSubscription: "Проверить подписку",
    subscriptionOk: "Подписка подтверждена. Можно запускать триал.",
    subscriptionMissing: "Подписка не найдена, подпишись на канал и проверь снова.",
    startHint: "Используй кнопки ниже для продолжения.",
    actions: {
      openCabinet: "Открыть кабинет",
      openPlans: "Тарифы и покупка",
      startTrial: "Запустить триал",
      renewM1: "Продлить на 1 месяц",
      renewM3: "Продлить на 3 месяца",
      renewM6: "Продлить на 6 месяцев",
      renewM12: "Продлить на 12 месяцев",
      instructions: "Открыть инструкции"
    },
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
