import { describe, expect, it } from "vitest";
import { createGitHubWebhookSignature, verifyGitHubWebhookSignature } from "./webhook";

describe("GitHub webhook signatures", () => {
  it("acepta la firma HMAC SHA-256 correcta", () => {
    const payload = JSON.stringify({ zen: "Keep it logically awesome." });
    const signature = createGitHubWebhookSignature(payload, "secret");
    expect(verifyGitHubWebhookSignature(payload, signature, "secret")).toBe(true);
  });

  it("rechaza payloads modificados, firmas inválidas y secretos vacíos", () => {
    const signature = createGitHubWebhookSignature("original", "secret");
    expect(verifyGitHubWebhookSignature("modified", signature, "secret")).toBe(false);
    expect(verifyGitHubWebhookSignature("original", "sha1=invalid", "secret")).toBe(false);
    expect(verifyGitHubWebhookSignature("original", signature, "")).toBe(false);
    expect(verifyGitHubWebhookSignature("original", null, "secret")).toBe(false);
  });
});
