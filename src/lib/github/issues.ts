import "server-only";

import { createGitHubInstallationToken, githubJson } from "@/lib/github/auth";
import type { GitHubAppConfig } from "@/lib/github/env";

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  state_reason: "completed" | "not_planned" | "reopened" | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

const repoPath = (owner: string, repository: string) =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

async function token(config: GitHubAppConfig, installationId: number) {
  return (await createGitHubInstallationToken(config, installationId)).token;
}

export async function createGitHubIssue(input: {
  config: GitHubAppConfig;
  installationId: number;
  owner: string;
  repository: string;
  title: string;
  body: string;
}) {
  return githubJson<GitHubIssue>(
    `https://api.github.com${repoPath(input.owner, input.repository)}/issues`,
    await token(input.config, input.installationId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: input.title, body: input.body }),
    },
  );
}

export async function updateGitHubIssue(input: {
  config: GitHubAppConfig;
  installationId: number;
  owner: string;
  repository: string;
  number: number;
  title?: string;
  body?: string;
  state?: "open" | "closed";
  stateReason?: "completed" | "not_planned" | "reopened";
}) {
  return githubJson<GitHubIssue>(
    `https://api.github.com${repoPath(input.owner, input.repository)}/issues/${input.number}`,
    await token(input.config, input.installationId),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        state: input.state,
        state_reason: input.stateReason,
      }),
    },
  );
}
