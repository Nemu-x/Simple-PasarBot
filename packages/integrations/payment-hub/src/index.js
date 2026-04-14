import { buildPaymentRequest, createInvoice, verifyWebhookSignature } from "@simple-pasarbot/platega";

const providerFactories = {
  generic: {
    createPayload(input) {
      return buildPaymentRequest(input);
    },
    async createInvoice(apiKey, payload) {
      return createInvoice(apiKey, payload);
    },
    verifyWebhook(rawBody, signature, secret) {
      return verifyWebhookSignature(rawBody, signature, secret);
    }
  }
};

export function getProviderAdapter(providerName = "generic") {
  return providerFactories[String(providerName || "generic").toLowerCase()] || providerFactories.generic;
}
