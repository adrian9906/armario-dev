import "server-only";

import type { GitHubAppConfig } from "@/lib/github/env";
import { createGitHubInstallationToken, githubJson } from "@/lib/github/auth";

export type GitHubRepositorySummary = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  ssh_url: string;
  owner: { login: string };
  default_branch: string;
  visibility: "public" | "private" | "internal";
  archived: boolean;
  fork: boolean;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  size: number;
  updated_at: string;
  pushed_at: string | null;
};

export type GitHubBranch = {
  name: string;
  commit: { sha: string };
  protected: boolean;
};

export type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name: string; date: string } | null;
    committer: { name: string; date: string } | null;
  };
  author: { login: string; avatar_url: string } | null;
};

export type GitHubCommitDetail = GitHubCommit & {
  stats: { total: number; additions: number; deletions: number };
  files?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    blob_url: string;
    patch?: string;
  }>;
};

const repoPath = (owner: string, repository: string) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

export async function getGitHubProjectSnapshot(
  config: GitHubAppConfig,
  installationId: number,
  owner: string,
  repository: string,
) {
  const { token } = await createGitHubInstallationToken(config, installationId);
  const path = repoPath(owner, repository);
  const emptyRepositoryList = async <T>(request: Promise<T[]>) => {
    try {
      return await request;
    } catch (error) {
      if (error instanceof Error && error.message === "github_api_409") return [];
      throw error;
    }
  };
  const [summary, branches, commits] = await Promise.all([
    githubJson<GitHubRepositorySummary>(`https://api.github.com${path}`, token),
    emptyRepositoryList(githubJson<GitHubBranch[]>(`https://api.github.com${path}/branches?per_page=100`, token)),
    emptyRepositoryList(githubJson<GitHubCommit[]>(`https://api.github.com${path}/commits?per_page=30`, token)),
  ]);
  return { summary, branches, commits };
}

export async function getGitHubCommitDetail(
  config: GitHubAppConfig,
  installationId: number,
  owner: string,
  repository: string,
  sha: string,
) {
  const { token } = await createGitHubInstallationToken(config, installationId);
  return githubJson<GitHubCommitDetail>(
    `https://api.github.com${repoPath(owner, repository)}/commits/${encodeURIComponent(sha)}`,
    token,
  );
}

export async function createGitHubBranch(
  config: GitHubAppConfig,
  installationId: number,
  owner: string,
  repository: string,
  branch: string,
  baseBranch: string,
) {
  const { token } = await createGitHubInstallationToken(config, installationId);
  const path = repoPath(owner, repository);
  const base = await githubJson<GitHubBranch>(
    `https://api.github.com${path}/branches/${encodeURIComponent(baseBranch)}`,
    token,
  );
  return githubJson<{ ref: string; object: { sha: string } }>(`https://api.github.com${path}/git/refs`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.commit.sha }),
  });
}

export async function deleteGitHubBranch(
  config: GitHubAppConfig,
  installationId: number,
  owner: string,
  repository: string,
  branch: string,
) {
  const { token } = await createGitHubInstallationToken(config, installationId);
  const path = repoPath(owner, repository);
  const [summary, target] = await Promise.all([
    githubJson<GitHubRepositorySummary>(`https://api.github.com${path}`, token),
    githubJson<GitHubBranch>(`https://api.github.com${path}/branches/${encodeURIComponent(branch)}`, token),
  ]);
  if (branch === summary.default_branch) throw new Error("github_default_branch");
  if (target.protected) throw new Error("github_protected_branch");
  const ref = branch.split("/").map(encodeURIComponent).join("/");
  return githubJson<void>(`https://api.github.com${path}/git/refs/heads/${ref}`, token, {
    method: "DELETE",
  });
}
