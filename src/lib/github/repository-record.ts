import type { GitHubRepository } from "./repositories";

export function repositoryRecord(repository: GitHubRepository) {
  return {
    repository_id: repository.id,
    owner_login: repository.owner.login,
    name: repository.name,
    full_name: repository.full_name,
    description: repository.description,
    html_url: repository.html_url,
    clone_url: repository.clone_url,
    ssh_url: repository.ssh_url,
    default_branch: repository.default_branch,
    visibility: repository.visibility ?? (repository.private ? "private" : "public"),
    archived: repository.archived,
    last_synced_at: new Date().toISOString(),
  };
}
