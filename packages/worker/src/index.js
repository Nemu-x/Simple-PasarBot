import { createIncidentEvent, listBroadcastJobs, listSubscriptions, upsertSubscription } from "@simple-pasarbot/db";
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

async function processBroadcastQueue() {
  const jobs = await listBroadcastJobs(20);
  for (const job of jobs) {
    if (job.status === "pending") {
      console.log(`Broadcast job queued: ${job.id}`);
    }
  }
}

async function processAutorenewReminders() {
  const now = Date.now();
  const subs = await listSubscriptions();
  for (const sub of subs) {
    const expiresAt = new Date(sub.expiresAt).getTime();
    const daysLeft = Math.floor((expiresAt - now) / (24 * 60 * 60 * 1000));
    if (daysLeft <= 3 && daysLeft >= 0 && !sub.blocked) {
      console.log(`Autorenew reminder candidate user=${sub.userId} daysLeft=${daysLeft}`);
    }
  }
}

async function heartbeat() {
  await createIncidentEvent({
    level: "info",
    source: "worker",
    message: "worker heartbeat",
    meta: { at: new Date().toISOString() }
  });
}

setInterval(() => {
  reconcileSubscriptions().catch((error) => {
    console.error("Worker reconcile failed:", error.message);
  });
  processBroadcastQueue().catch((error) => {
    console.error("Worker broadcasts failed:", error.message);
  });
  processAutorenewReminders().catch((error) => {
    console.error("Worker renew reminders failed:", error.message);
  });
}, 30_000);
setInterval(() => {
  heartbeat().catch(() => undefined);
}, 5 * 60_000);
console.log("Worker started: reconcile each 30s");
