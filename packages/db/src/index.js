const users = new Map();
const subscriptions = new Map();
const plans = new Map([
  ["trial", { id: "trial", name: "Trial 24h", days: 1, trafficLimitBytes: 5_000_000_000, isTrial: true }],
  ["monthly", { id: "monthly", name: "Month", days: 30, trafficLimitBytes: 100_000_000_000, isTrial: false }]
]);

export function getOrCreateUser(telegramId) {
  const key = String(telegramId);
  if (!users.has(key)) {
    users.set(key, { id: key, telegramId: key, hasUsedTrial: false, createdAt: new Date().toISOString() });
  }
  return users.get(key);
}

export function setUser(user) {
  users.set(String(user.telegramId), user);
  return user;
}

export function listPlans() {
  return [...plans.values()];
}

export function getPlan(planId) {
  return plans.get(planId);
}

export function upsertSubscription(subscription) {
  subscriptions.set(String(subscription.userId), subscription);
  return subscription;
}

export function getSubscriptionByUserId(userId) {
  return subscriptions.get(String(userId));
}

export function listSubscriptions() {
  return [...subscriptions.values()];
}
