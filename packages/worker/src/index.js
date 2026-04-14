import { listSubscriptions, upsertSubscription } from "@simple-pasarbot/db";
import { evaluateSubscription, SubscriptionStatus } from "@simple-pasarbot/domain";

async function reconcileSubscriptions() {
  const subs = await listSubscriptions();
  for (const sub of subs) {
    const status = evaluateSubscription(sub);
    if (status === SubscriptionStatus.EXPIRED) {
      sub.blocked = true;
      sub.status = "blocked";
      await upsertSubscription(sub);
      console.log(`Blocked expired subscription for user ${sub.userId}`);
    }
  }
}

setInterval(() => {
  reconcileSubscriptions().catch((error) => {
    console.error("Worker reconcile failed:", error.message);
  });
}, 30_000);
console.log("Worker started: reconcile each 30s");
