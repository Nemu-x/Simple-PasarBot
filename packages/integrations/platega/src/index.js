import crypto from "node:crypto";

export function verifyWebhookSignature(rawBody, signature, secret) {
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature || ""));
}

export function buildPaymentRequest({ userId, planId, amount, callbackUrl }) {
  return {
    idempotencyKey: `${userId}:${planId}`,
    amount,
    currency: "RUB",
    callbackUrl,
    metadata: { userId, planId }
  };
}

export async function createInvoice(apiKey, payload) {
  const response = await fetch("https://platega.io/api/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Platega create invoice failed with ${response.status}`);
  }
  return response.json();
}
