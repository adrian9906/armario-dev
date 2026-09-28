import "server-only";

import type { GitHubAppConfig } from "@/lib/github/env";
import { createGitHubInstallationToken, githubJson } from "@/lib/github/auth";

export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  visibility: "public" | "private" | "internal";
  html_url: string;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  archived: boolean;
  owner: { login: string };
  updated_at: string;
};

export { repositoryRecord } from "./repository-record";

type RepositoryPage = { total_count: number; repositories: GitHubRepository[] };

export async function listGitHubInstallationRepositories(config: GitHubAppConfig, installationId: number) {
  const { token } = await createGitHubInstallationToken(config, installationId);
  const repositories: GitHubRepository[] = [];

  for (let page = 1; page <= 5; page += 1) {
    const response = await githubJson<RepositoryPage>(
      `https://api.github.com/installation/repositories?per_page=100&page=${page}`,
      token,
    );
    repositories.push(...response.repositories);
    if (repositories.length >= response.total_count || response.repositories.length < 100) break;
  }

  return repositories.sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export async function getGitHubInstallationRepository(
  config: GitHubAppConfig,
  installationId: number,
  repositoryId: number,
) {
  const { token } = await createGitHubInstallationToken(config, installationId);
  return githubJson<GitHubRepository>(`https://api.github.com/repositories/${repositoryId}`, token);
}

export async function createGitHubRepository(
  config: GitHubAppConfig,
  installation: { installationId: number; accountLogin: string; accountType: string },
  input: {
    name: string;
    description: string;
    visibility: "public" | "private";
    initializeReadme: boolean;
    gitignoreTemplate?: string;
    licenseTemplate?: string;
  },
) {
  const { token } = await createGitHubInstallationToken(config, installation.installationId);
  const path = installation.accountType === "Organization"
    ? `/orgs/${encodeURIComponent(installation.accountLogin)}/repos`
    : "/user/repos";
  const autoInit = input.initializeReadme || Boolean(input.gitignoreTemplate) || Boolean(input.licenseTemplate);

  return githubJson<GitHubRepository>(`https://api.github.com${path}`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      description: input.description || undefined,
      private: input.visibility === "private",
      auto_init: autoInit,
      gitignore_template: input.gitignoreTemplate || undefined,
      license_template: input.licenseTemplate || undefined,
    }),
  });
}

