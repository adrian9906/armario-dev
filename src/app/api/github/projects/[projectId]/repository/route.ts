import { auth } from "@clerk/nextjs/server";
import { getLinkedGitHubProject } from "@/lib/github/project-context";
import { getGitHubProjectSnapshot } from "@/lib/github/repository-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { userId } = await auth.protect();
  const { projectId } = await params;
  const context = await getLinkedGitHubProject(projectId, userId);
  if (!context) return Response.json({ error: "No hay un repositorio vinculado o no tienes acceso." }, { status: 404 });

  try {
    const snapshot = await getGitHubProjectSnapshot(
      context.config,
      context.installation.installation_id,
      context.repository.owner_login,
      context.repository.name,
    );
    const syncedAt = new Date().toISOString();
    const { summary } = snapshot;
    const { error } = await context.admin.from("project_repositories").update({
      repository_id: summary.id,
      owner_login: summary.owner.login,
      name: summary.name,
      full_name: summary.full_name,
      description: summary.description,
      html_url: summary.html_url,
      clone_url: summary.clone_url,
      ssh_url: summary.ssh_url,
      default_branch: summary.default_branch,
      visibility: summary.visibility,
      archived: summary.archived,
      last_synced_at: syncedAt,
    }).eq("project_id", projectId).eq("workspace_id", context.access.project.workspace_id);
    if (error) console.error("Could not persist GitHub repository metadata", error);

    return Response.json({
      summary: {
        id: summary.id,
        fullName: summary.full_name,
        description: summary.description,
        htmlUrl: summary.html_url,
        defaultBranch: summary.default_branch,
        visibility: summary.visibility,
        archived: summary.archived,
        fork: summary.fork,
        language: summary.language,
        stars: summary.stargazers_count,
        forks: summary.forks_count,
        openIssues: summary.open_issues_count,
        size: summary.size,
        updatedAt: summary.updated_at,
        pushedAt: summary.pushed_at,
      },
      branches: snapshot.branches.map((branch) => ({
        name: branch.name,
        sha: branch.commit.sha,
        protected: branch.protected,
      })),
      commits: snapshot.commits.map((commit) => ({
        sha: commit.sha,
        htmlUrl: commit.html_url,
        message: commit.commit.message,
        authoredAt: commit.commit.author?.date ?? commit.commit.committer?.date ?? null,
        authorName: commit.author?.login ?? commit.commit.author?.name ?? "GitHub",
        authorAvatarUrl: commit.author?.avatar_url ?? null,
      })),
      syncedAt,
    });
  } catch (error) {
    console.error("Could not load GitHub project snapshot", error);
    return Response.json({ error: "No se pudo sincronizar la actividad de GitHub." }, { status: 502 });
  }
}
