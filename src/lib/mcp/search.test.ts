import { describe, expect, it } from "vitest";
import { buildMcpSearchFilter, createSearchSnippet, normalizeMcpSearchQuery } from "./search";

describe("MCP document search helpers", () => {
  it("normalizes bounded text and strips PostgREST filter syntax", () => {
    expect(normalizeMcpSearchQuery('  auth),workspace_id.neq.x,"admin"  ')).toBe("auth workspace id.neq.x admin");
    expect(normalizeMcpSearchQuery("  ")).toBe("");
    expect(normalizeMcpSearchQuery("x".repeat(150))).toHaveLength(120);
  });

  it("builds a filter only from trusted field names and normalized query text", () => {
    expect(buildMcpSearchFilter(["title", "description"], 'role,owner)\n"admin"'))
      .toBe('title.ilike."%role owner admin%",description.ilike."%role owner admin%"');
  });

  it("returns a short snippet centered on the matching text", () => {
    const text = `${"x".repeat(130)} Architecture decisions describe how the system should behave. ${"y".repeat(130)}`;
    const snippet = createSearchSnippet(text, "architecture decisions", 20);
    expect(snippet).toContain("Architecture decisions");
    expect(snippet.startsWith("…")).toBe(true);
    expect(snippet.length).toBeLessThan(100);
  });
});
