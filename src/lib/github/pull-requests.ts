import "server-only";

import type { GitHubAppConfig } from "@/lib/github/env";
import { createGitHubInstallationToken, githubJson } from "@/lib/github/auth";

export type GitHubPullRequest = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  merged_at: string | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string };
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string; sha: string };
  mergeable: boolean | null;
  mergeable_state: string;
  additions: number;
  deletions: number;
  changed_files: number;
  commits: number;
  comments: number;
  review_comments: number;
};

export type GitHubPullRequestFile = {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  blob_url: string;
  patch?: string;
};

export type GitHubPullRequestReview = {
  id: number;
  user: { login: string; avatar_url: string } | null;
  body: string | null;
  state: string;
  html_url: string;
  submitted_at: string | null;
};

export type GitHubPullRequestCommit = {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
  author: { login: string } | null;
};

type GitHubBranch = { name: string; commit: { sha: string }; protected: boolean };
const repoPath = (owner: string, repository: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

async function installationToken(config: GitHubAppConfig, installationId: number) {
  return (await createGitHubInstallationToken(config, installationId)).token;
}

export async function listGitHubPullRequests(
  config: GitHubAppConfig,
  installationId: number,
  owner: string,
  repository: string,
) {
  const token = await installationToken(config, installationId);
  const path = repoPath(owner, repository);
  const [pullRequests, branches] = await Promise.all([
    githubJson<GitHubPullRequest[]>(`https://api.github.com${path}/pulls?state=all&sort=updated&direction=desc&per_page=50`, token),
    githubJson<GitHubBranch[]>(`https://api.github.com${path}/branches?per_page=100`, token),
  ]);
  return { pullRequests, branches };
}

export async function getGitHubPullRequestDetail(
  config: GitHubAppConfig,
  installationId: number,
  owner: string,
  repository: string,
  number: number,
) {
  const token = await installationToken(config, installationId);
  const path = `${repoPath(owner, repository)}/pulls/${number}`;
  const [pullRequest, commits, files, reviews] = await Promise.all([
    githubJson<GitHubPullRequest>(`https://api.github.com${path}`, token),
    githubJson<GitHubPullRequestCommit[]>(`https://api.github.com${path}/commits?per_page=100`, token),
    githubJson<GitHubPullRequestFile[]>(`https://api.github.com${path}/files?per_page=100`, token),
    githubJson<GitHubPullRequestReview[]>(`https://api.github.com${path}/reviews?per_page=100`, token),
  ]);
  return { pullRequest, commits, files, reviews };
}

export async function createGitHubPullRequest(input: {
  config: GitHubAppConfig;
  installationId: number;
  owner: string;
  repository: string;
  title: string;
  body: string;
  head: string;
  base: string;
  draft: boolean;
}) {
  const token = await installationToken(input.config, input.installationId);
  return githubJson<GitHubPullRequest>(`https://api.github.com${repoPath(input.owner, input.repository)}/pulls`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: input.title, body: input.body, head: input.head, base: input.base, draft: input.draft }),
  });
}

export async function updateGitHubPullRequest(input: {
  config: GitHubAppConfig;
  installationId: number;
  owner: string;
  repository: string;
  number: number;
  title?: string;
  body?: string;
  state?: "open" | "closed";
  base?: string;
}) {
  const token = await installationToken(input.config, input.installationId);
  return githubJson<GitHubPullRequest>(`https://api.github.com${repoPath(input.owner, input.repository)}/pulls/${input.number}`, token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: input.title, body: input.body, state: input.state, base: input.base }),
  });
}

export async function reviewGitHubPullRequest(input: {
  config: GitHubAppConfig;
  installationId: number;
  owner: string;
  repository: string;
  number: number;
  body: string;
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
}) {
  const token = await installationToken(input.config, input.installationId);
  return githubJson<GitHubPullRequestReview>(`https://api.github.com${repoPath(input.owner, input.repository)}/pulls/${input.number}/reviews`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: input.body, event: input.event }),
  });
}

export async function mergeGitHubPullRequest(input: {
  config: GitHubAppConfig;
  installationId: number;
  owner: string;
  repository: string;
  number: number;
  expectedHeadSha: string;
  method: "merge" | "squash" | "rebase";
  commitTitle: string;
  commitMessage: string;
}) {
  const token = await installationToken(input.config, input.installationId);
  return githubJson<{ sha: string; merged: boolean; message: string }>(`https://api.github.com${repoPath(input.owner, input.repository)}/pulls/${input.number}/merge`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sha: input.expectedHeadSha,
      merge_method: input.method,
      commit_title: input.commitTitle,
      commit_message: input.commitMessage,
    }),
  });
}

