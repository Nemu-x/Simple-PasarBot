import { listSubscriptions, upsertSubscription } from "@simple-pasarbot/db";
import { evaluateSubscription, SubscriptionStatus } from "@simple-pasarbot/domain";

function reconcileSubscriptions() {
  const subs = listSubscriptions();
  for (const sub of subs) {
    const status = evaluateSubscription(sub);
    if (status === SubscriptionStatus.EXPIRED) {
      sub.blocked = true;
      sub.status = "blocked";
      upsertSubscription(sub);
      console.log(`Blocked expired subscription for user ${sub.userId}`);
    }
  }
}

setInterval(reconcileSubscriptions, 30_000);
console.log("Worker started: reconcile each 30s");
