export const SubscriptionStatus = Object.freeze({
  TRIAL: "trial",
  ACTIVE: "active",
  BLOCKED: "blocked",
  EXPIRED: "expired"
});

export function canStartTrial(user) {
  return !user.hasUsedTrial;
}

export function evaluateSubscription(subscription, now = new Date()) {
  if (subscription.blocked) {
    return SubscriptionStatus.BLOCKED;
  }
  if (new Date(subscription.expiresAt) <= now) {
    return SubscriptionStatus.EXPIRED;
  }
  if (subscription.isTrial) {
    return SubscriptionStatus.TRIAL;
  }
  return SubscriptionStatus.ACTIVE;
}

export function shouldBlockForTraffic(subscription, trafficUsedBytes) {
  if (!subscription.trafficLimitBytes) {
    return false;
  }
  return trafficUsedBytes >= subscription.trafficLimitBytes;
}
