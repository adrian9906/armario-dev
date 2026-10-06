import "server-only";

import { createGitHubInstallationToken, githubJson } from "@/lib/github/auth";
import { commitFilesToGitHub } from "@/lib/github/git-data";
import { isValidGitBranchName } from "@/lib/github/branch-name";
import { createGitHubIssue, updateGitHubIssue } from "@/lib/github/issues";
import {
  createGitHubPullRequest,
  getGitHubPullRequestDetail,
  listGitHubPullRequests,
  mergeGitHubPullRequest,
  reviewGitHubPullRequest,
  updateGitHubPullRequest,
} from "@/lib/github/pull-requests";
import { createGitHubBranch, getGitHubCommitDetail, getGitHubProjectSnapshot } from "@/lib/github/repository-activity";
import { getMcpGitHubRepository } from "@/lib/mcp/repository";

type RepositoryContext = NonNullable<Awaited<ReturnType<typeof getMcpGitHubRepository>>>;
type WritePermission = "contents" | "issues" | "pull_requests";

async function repositoryFor(userId: string, projectId: string) {
  const context = await getMcpGitHubRepository(userId, projectId);
  if (!context) return null;
  return context;
}

function assertCanWrite(context: RepositoryContext, permission: WritePermission) {
  if (context.access.access !== "manager") throw new Error("mcp_github_manager_required");
  const permissions = context.installation.permissions as Record<string, unknown> | null;
  if (permissions?.[permission] !== "write") throw new Error(`mcp_github_${permission}_write_permission_required`);
}

function githubIdentity(context: RepositoryContext) {
  return {
    config: context.config,
    installationId: context.installation.installation_id,
    owner: context.repository.owner_login,
    repository: context.repository.name,
  };
}

async function auditedWrite<T>(context: RepositoryContext, userId: string, operation: string, payload: Record<string, unknown>, run: () => Promise<T>) {
  const { data: job, error: insertError } = await context.admin.from("github_sync_jobs").insert({
    workspace_id: context.access.project.workspace_id,
    project_id: context.access.project.id,
    operation: `mcp_github_${operation}`,
    payload: { repository: context.repository.full_name, ...payload },
    status: "running",
    attempt_count: 1,
    started_at: new Date().toISOString(),
    created_by: userId,
  }).select("id").single();
  if (insertError || !job) throw new Error("mcp_github_audit_start_failed");

  try {
    const result = await run();
    const { error } = await context.admin.from("github_sync_jobs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      payload: { repository: context.repository.full_name, ...payload, result: auditSummary(result) },
    }).eq("id", job.id);
    return { result, auditRecorded: !error };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1900) : "github_operation_failed";
    await context.admin.from("github_sync_jobs").update({
      status: "failed", error: message, finished_at: new Date().toISOString(),
    }).eq("id", job.id);
    throw error;
  }
}

function auditSummary(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const row = value as Record<string, unknown>;
  return Object.fromEntries(["number", "title", "html_url", "sha", "ref", "merged", "state"].flatMap((key) =>
    row[key] === undefined ? [] : [[key, row[key]]],
  ));
}

export async function getMcpRepositorySnapshot(userId: string, projectId: string) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  const snapshot = await getGitHubProjectSnapshot(context.config, context.installation.installation_id,
    context.repository.owner_login, context.repository.name);
  return { repository: context.repository.full_name, ...snapshot };
}

export async function listMcpGitHubIssues(userId: string, projectId: string, state: "open" | "closed" | "all" = "open") {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  const { token } = await createGitHubInstallationToken(context.config, context.installation.installation_id);
  const url = `https://api.github.com/repos/${encodeURIComponent(context.repository.owner_login)}/${encodeURIComponent(context.repository.name)}/issues?state=${state}&sort=updated&direction=desc&per_page=100`;
  const issues = await githubJson<Array<Record<string, unknown>>>(url, token);
  return { repository: context.repository.full_name, issues: issues.filter((issue) => !issue.pull_request) };
}

export async function listMcpGitHubPullRequests(userId: string, projectId: string) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  const result = await listGitHubPullRequests(context.config, context.installation.installation_id,
    context.repository.owner_login, context.repository.name);
  return { repository: context.repository.full_name, ...result };
}

export async function getMcpGitHubCommit(userId: string, projectId: string, sha: string) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  const commit = await getGitHubCommitDetail(context.config, context.installation.installation_id,
    context.repository.owner_login, context.repository.name, sha);
  return { repository: context.repository.full_name, commit };
}

export async function getMcpGitHubPullRequest(userId: string, projectId: string, number: number) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  const pullRequest = await getGitHubPullRequestDetail(context.config, context.installation.installation_id,
    context.repository.owner_login, context.repository.name, number);
  return { repository: context.repository.full_name, ...pullRequest };
}

export async function createMcpGitHubBranch(userId: string, projectId: string, branch: string, baseBranch?: string) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  assertCanWrite(context, "contents");
  if (!isValidGitBranchName(branch)) throw new Error("mcp_github_invalid_branch_name");
  const { result, auditRecorded } = await auditedWrite(context, userId, "create_branch", { branch, baseBranch: baseBranch ?? context.repository.default_branch }, () =>
    createGitHubBranch(context.config, context.installation.installation_id, context.repository.owner_login,
      context.repository.name, branch, baseBranch ?? context.repository.default_branch));
  return { result, auditRecorded };
}

export async function commitMcpGitHubFiles(userId: string, projectId: string, input: {
  branch: string; expectedHeadSha: string; message: string; files: Array<{ path: string; content: string }>;
}) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  assertCanWrite(context, "contents");
  if (!isValidGitBranchName(input.branch)) throw new Error("mcp_github_invalid_branch_name");
  if (!/^[a-f0-9]{40}$/i.test(input.expectedHeadSha)) throw new Error("mcp_github_invalid_expected_head_sha");
  if (input.files.length > 20 || input.files.some((file) => {
    const segments = file.path.split("/");
    return file.path.startsWith("/") || file.path.includes("\\") || /[\x00-\x1f\x7f]/.test(file.path)
      || segments.some((segment) => !segment || segment === "." || segment === "..")
      || Buffer.byteLength(file.content, "utf8") > 100_000;
  }))
    throw new Error("mcp_github_commit_limit_exceeded");
  const { result, auditRecorded } = await auditedWrite(context, userId, "commit_files", {
    branch: input.branch, expectedHeadSha: input.expectedHeadSha, message: input.message,
    paths: input.files.map((file) => file.path),
  }, () => commitFilesToGitHub({ ...githubIdentity(context), ...input }));
  return { result, auditRecorded };
}

export async function createMcpGitHubIssue(userId: string, projectId: string, title: string, body: string) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  assertCanWrite(context, "issues");
  const { result, auditRecorded } = await auditedWrite(context, userId, "create_issue", { title }, () =>
    createGitHubIssue({ ...githubIdentity(context), title, body }));
  return { result, auditRecorded };
}

export async function updateMcpGitHubIssue(userId: string, projectId: string, input: {
  number: number; title?: string; body?: string; state?: "open" | "closed"; stateReason?: "completed" | "not_planned" | "reopened";
}) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  assertCanWrite(context, "issues");
  const { number, ...changes } = input;
  const { result, auditRecorded } = await auditedWrite(context, userId, "update_issue", { number, ...changes }, () =>
    updateGitHubIssue({ ...githubIdentity(context), number, ...changes }));
  return { result, auditRecorded };
}

export async function createMcpGitHubPullRequest(userId: string, projectId: string, input: {
  title: string; body: string; head: string; base?: string; draft?: boolean;
}) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  assertCanWrite(context, "pull_requests");
  if (!isValidGitBranchName(input.head) || (input.base && !isValidGitBranchName(input.base))) throw new Error("mcp_github_invalid_branch_name");
  const { result, auditRecorded } = await auditedWrite(context, userId, "create_pull_request", input, () =>
    createGitHubPullRequest({ ...githubIdentity(context), title: input.title, body: input.body, head: input.head,
      base: input.base ?? context.repository.default_branch, draft: input.draft ?? false }));
  return { result, auditRecorded };
}

export async function updateMcpGitHubPullRequest(userId: string, projectId: string, input: {
  number: number; title?: string; body?: string; state?: "open" | "closed"; base?: string;
}) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  assertCanWrite(context, "pull_requests");
  if (input.base && !isValidGitBranchName(input.base)) throw new Error("mcp_github_invalid_branch_name");
  const { number, ...changes } = input;
  const { result, auditRecorded } = await auditedWrite(context, userId, "update_pull_request", { number, ...changes }, () =>
    updateGitHubPullRequest({ ...githubIdentity(context), number, ...changes }));
  return { result, auditRecorded };
}

export async function reviewMcpGitHubPullRequest(userId: string, projectId: string, input: {
  number: number; event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"; body: string;
}) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  assertCanWrite(context, "pull_requests");
  const { result, auditRecorded } = await auditedWrite(context, userId, "review_pull_request", input, () =>
    reviewGitHubPullRequest({ ...githubIdentity(context), ...input }));
  return { result, auditRecorded };
}

export async function mergeMcpGitHubPullRequest(userId: string, projectId: string, input: {
  number: number; expectedHeadSha: string; method: "merge" | "squash" | "rebase"; commitTitle: string; commitMessage: string;
}) {
  const context = await repositoryFor(userId, projectId);
  if (!context) return null;
  assertCanWrite(context, "pull_requests");
  if (!/^[a-f0-9]{40}$/i.test(input.expectedHeadSha)) throw new Error("mcp_github_invalid_expected_head_sha");
  const { result, auditRecorded } = await auditedWrite(context, userId, "merge_pull_request", input, () =>
    mergeGitHubPullRequest({ ...githubIdentity(context), ...input }));
  return { result, auditRecorded };
}
