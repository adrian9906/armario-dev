import { describe, expect, it } from "vitest";
import { createGitHubConnectionState, hashGitHubConnectionState } from "./state";

describe("GitHub connection state", () => {
  it("crea valores aleatorios y almacena solamente su hash", () => {
    const first = createGitHubConnectionState();
    const second = createGitHubConnectionState();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
    expect(hashGitHubConnectionState(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashGitHubConnectionState(first)).not.toBe(hashGitHubConnectionState(second));
  });
});
