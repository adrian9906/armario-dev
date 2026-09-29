import { describe, expect, it } from "vitest";
import { taskBranchName, taskIdFromGitHubBody, taskStatusFromIssue, webhookDedupeKey } from "./automation-rules";

describe("GitHub automation rules", () => {
  it("builds stable, readable task branches", () => {
    expect(taskBranchName("feature/task", "bb09152d-644d-4954-85e8-29b22a2210dd", "Añadir inicio de sesión"))
      .toBe("feature/task/bb09152d-anadir-inicio-de-sesion");
  });

  it("maps issue state changes without losing in-progress work", () => {
    expect(taskStatusFromIssue("closed", false)).toBe("done");
    expect(taskStatusFromIssue("reopened", true)).toBe("in_progress");
    expect(taskStatusFromIssue("reopened", false)).toBe("todo");
    expect(taskStatusFromIssue("edited", false)).toBeNull();
  });

  it("reads only valid Armario task markers", () => {
    expect(taskIdFromGitHubBody("<!-- armario-dev-task:bb09152d-644d-4954-85e8-29b22a2210dd -->"))
      .toBe("bb09152d-644d-4954-85e8-29b22a2210dd");
    expect(taskIdFromGitHubBody("<!-- armario-dev-task:not-valid -->")).toBeNull();
  });

  it("uses the delivery id to make webhook handling idempotent", () => {
    expect(webhookDedupeKey("delivery-1", "issues", "closed"))
      .toBe("github:delivery-1:issues:closed");
  });
});
