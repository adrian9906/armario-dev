import { describe, expect, it } from "vitest";
import { chooseRepositoryFiles, decodeGitHubTextBlob, isIndexableRepositoryPath } from "./repository-index";

describe("MCP repository index safety", () => {
  it("accepts common source and documentation files", () => {
    expect(isIndexableRepositoryPath("src/app/page.tsx", 100)).toBe(true);
    expect(isIndexableRepositoryPath("docs/architecture.md", 100)).toBe(true);
    expect(isIndexableRepositoryPath("Dockerfile", 100)).toBe(true);
  });

  it("rejects secrets, generated directories, binary types, and oversized files", () => {
    for (const path of [".env", ".env.production", "config/credentials.json", "keys/signing.pem", "node_modules/pkg/index.js", "public/logo.svg", "../outside.ts"]) {
      expect(isIndexableRepositoryPath(path, 100)).toBe(false);
    }
    expect(isIndexableRepositoryPath("src/huge.ts", 48_001)).toBe(false);
  });

  it("caps the tree and selected file count", () => {
    const entries = Array.from({ length: 130 }, (_, index) => ({ path: `src/${index}.ts`, type: "blob", size: 10, sha: `${index}` }));
    expect(chooseRepositoryFiles(entries)).toHaveLength(120);
    expect(() => chooseRepositoryFiles(Array.from({ length: 20_001 }, (_, index) => ({ path: `${index}.md`, type: "blob", size: 1, sha: `${index}` })))).toThrow("mcp_repository_tree_too_large");
  });

  it("decodes UTF-8 blobs and rejects binary or invalid content", () => {
    expect(decodeGitHubTextBlob(Buffer.from("hola mundo").toString("base64"), "base64")).toBe("hola mundo");
    expect(decodeGitHubTextBlob(Buffer.from([0, 1, 2]).toString("base64"), "base64")).toBeNull();
    expect(() => decodeGitHubTextBlob("//79", "base64")).toThrow();
  });
});
