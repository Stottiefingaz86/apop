import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vercel webhook signature: hex-encoded HMAC-SHA256 of raw body with webhook secret.
 * See https://vercel.com/docs/webhooks#verify-webhook-signature
 */
export function verifyVercelWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(signatureHeader, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
