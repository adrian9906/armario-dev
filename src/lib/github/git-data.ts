import "server-only";

import type { GitHubAppConfig } from "@/lib/github/env";
import { createGitHubInstallationToken, githubJson } from "@/lib/github/auth";

type CommitFile = { path: string; content: string };
const repoPath = (owner: string, repository: string) => `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;

export async function commitFilesToGitHub(input: {
  config: GitHubAppConfig;
  installationId: number;
  owner: string;
  repository: string;
  branch: string;
  expectedHeadSha: string;
  message: string;
  files: CommitFile[];
}) {
  if (!input.files.length || input.files.length > 100) throw new Error("github_commit_file_count");
  if (input.files.some((file) => !file.path || file.path.includes("..") || Buffer.byteLength(file.content, "utf8") > 1_000_000))
    throw new Error("github_commit_invalid_file");

  const { token } = await createGitHubInstallationToken(input.config, input.installationId);
  const path = repoPath(input.owner, input.repository);
  const branchRef = input.branch.split("/").map(encodeURIComponent).join("/");
  const ref = await githubJson<{ object: { sha: string } }>(`https://api.github.com${path}/git/ref/heads/${branchRef}`, token);
  if (ref.object.sha !== input.expectedHeadSha) throw new Error("github_branch_moved");

  const parent = await githubJson<{ sha: string; tree: { sha: string } }>(`https://api.github.com${path}/git/commits/${ref.object.sha}`, token);
  const blobs = await Promise.all(input.files.map(async (file) => {
    const blob = await githubJson<{ sha: string }>(`https://api.github.com${path}/git/blobs`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: Buffer.from(file.content, "utf8").toString("base64"), encoding: "base64" }),
    });
    return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
  }));
  const tree = await githubJson<{ sha: string }>(`https://api.github.com${path}/git/trees`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: parent.tree.sha, tree: blobs }),
  });
  const commit = await githubJson<{ sha: string; html_url: string }>(`https://api.github.com${path}/git/commits`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [parent.sha] }),
  });
  try {
    await githubJson(`https://api.github.com${path}/git/refs/heads/${branchRef}`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } catch (error) {
    if (error instanceof Error && ["github_api_409", "github_api_422"].includes(error.message))
      throw new Error("github_branch_moved");
    throw error;
  }
  return commit;
}

