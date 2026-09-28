import { describe, expect, it } from "vitest";
import { isValidGitBranchName } from "./branch-name";

describe("GitHub branch names", () => {
  it.each(["feature/login", "fix-123", "release/2026.09", "área/interfaz"])("acepta %s", (name) => {
    expect(isValidGitBranchName(name)).toBe(true);
  });

  it.each(["", "@", ".oculta", "main.", "/main", "main/", "a//b", "a..b", "a@{b", "feature login", "a~b", "topic.lock", "a/topic.lock"])("rechaza %s", (name) => {
    expect(isValidGitBranchName(name)).toBe(false);
  });
});
