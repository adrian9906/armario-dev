import { describe, expect, it } from "vitest";
import { canAssignProjectMember, resolveProjectRole } from "./project-permissions";

describe("project permissions", () => {
  it("keeps the creator and workspace managers in control", () => {
    expect(resolveProjectRole({ userId: "creator", creatorId: "creator", visibility: "private", workspaceRole: "editor" })).toBe("manager");
    expect(resolveProjectRole({ userId: "admin", creatorId: "creator", visibility: "private", workspaceRole: "admin" })).toBe("manager");
  });

  it("inherits workspace roles only in workspace mode", () => {
    expect(resolveProjectRole({ userId: "editor", creatorId: "creator", visibility: "workspace", workspaceRole: "editor" })).toBe("editor");
    expect(resolveProjectRole({ userId: "viewer", creatorId: "creator", visibility: "private", workspaceRole: "viewer" })).toBeNull();
  });

  it("uses explicit roles in restricted mode", () => {
    expect(resolveProjectRole({ userId: "member", creatorId: "creator", visibility: "restricted", workspaceRole: "viewer", explicitRole: "contributor" })).toBe("contributor");
    expect(resolveProjectRole({ userId: "member", creatorId: "creator", visibility: "restricted", workspaceRole: "viewer" })).toBeNull();
  });

  it("only assigns work to people who can open the project", () => {
    const project = { creator_id: "creator", visibility: "restricted" as const };
    const explicit = new Set(["collaborator"]);
    expect(canAssignProjectMember(project, { user_id: "collaborator", role: "viewer" }, explicit)).toBe(true);
    expect(canAssignProjectMember(project, { user_id: "outsider", role: "viewer" }, explicit)).toBe(false);
    expect(canAssignProjectMember(project, { user_id: "admin", role: "admin" }, explicit)).toBe(true);
  });
});
