import { createHmac, timingSafeEqual } from "node:crypto";

const signaturePrefix = "sha256=";

export function createGitHubWebhookSignature(payload: string, secret: string) {
  return `${signaturePrefix}${createHmac("sha256", secret).update(payload, "utf8").digest("hex")}`;
}

export function verifyGitHubWebhookSignature(payload: string, signature: string | null, secret: string) {
  if (!signature?.startsWith(signaturePrefix) || !secret) return false;

  const expected = Buffer.from(createGitHubWebhookSignature(payload, secret), "utf8");
  const received = Buffer.from(signature, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
