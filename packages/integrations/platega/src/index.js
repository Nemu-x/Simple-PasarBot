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
  const baseUrl = process.env.PAYMENT_API_BASE_URL || "https://payment-provider.example/api";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Payment provider create invoice failed with ${response.status}`);
  }
  return response.json();
}
