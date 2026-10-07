import { describe, expect, it } from "vitest";
import { formatMcpGitHubError, makeGitHubApiError } from "./api-errors";

describe("GitHub API error classification", () => {
  it("recognizes primary and secondary rate limits", () => {
    expect(makeGitHubApiError(429, new Headers()).message).toBe("github_api_rate_limited");
    expect(makeGitHubApiError(403, new Headers({ "x-ratelimit-remaining": "0" })).message).toBe("github_api_rate_limited");
    expect(makeGitHubApiError(403, new Headers({ "retry-after": "60" })).message).toBe("github_api_rate_limited");
    expect(makeGitHubApiError(403, new Headers(), '{"message":"You have exceeded a secondary rate limit"}').message)
      .toBe("github_api_rate_limited");
  });

  it("keeps permission denials distinct from rate limiting", () => {
    expect(makeGitHubApiError(403, new Headers()).message).toBe("github_api_403");
  });

  it("maps common API failures to safe actionable MCP messages", () => {
    expect(formatMcpGitHubError(new Error("github_api_rate_limited"), "fallback"))
      .toContain("limitó temporalmente");
    expect(formatMcpGitHubError(new Error("github_api_403"), "fallback"))
      .toContain("no permiten");
    expect(formatMcpGitHubError(new Error("github_api_404"), "fallback"))
      .toContain("No se encontró");
    expect(formatMcpGitHubError(new Error("unknown"), "fallback")).toBe("fallback");
  });
});
