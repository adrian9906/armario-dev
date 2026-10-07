import { describe, expect, it } from "vitest";
import { serializeMcpOutput } from "./output";

describe("MCP output bounds", () => {
  it("preserves normal JSON responses", () => {
    expect(serializeMcpOutput({ ok: true })).toBe('{"ok":true}');
  });

  it("returns valid, explicitly marked JSON when output is too large", () => {
    const response = serializeMcpOutput({ content: "x".repeat(1000) }, 200);
    expect(response.length).toBeLessThanOrEqual(200);
    expect(JSON.parse(response)).toMatchObject({ truncated: true, reason: "response_too_large", maxCharacters: 200 });
  });
});
