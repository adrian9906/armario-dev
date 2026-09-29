import { auth } from "@clerk/nextjs/server";
import { getLinkedGitHubProject } from "@/lib/github/project-context";
import { listGitHubPullRequests } from "@/lib/github/pull-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { userId } = await auth.protect();
  const { projectId } = await params;
  const context = await getLinkedGitHubProject(projectId, userId);
  if (!context) return Response.json({ error: "No hay un repositorio vinculado o no tienes acceso." }, { status: 404 });

  try {
    const result = await listGitHubPullRequests(
      context.config,
      context.installation.installation_id,
      context.repository.owner_login,
      context.repository.name,
    );
    return Response.json({
      repository: context.repository.full_name,
      defaultBranch: context.repository.default_branch,
      branches: result.branches.map((branch) => ({ name: branch.name, sha: branch.commit.sha, protected: branch.protected })),
      pullRequests: result.pullRequests.map((pullRequest) => ({
        number: pullRequest.number,
        title: pullRequest.title,
        body: pullRequest.body,
        state: pullRequest.state,
        draft: pullRequest.draft,
        merged: Boolean(pullRequest.merged_at),
        mergedAt: pullRequest.merged_at,
        htmlUrl: pullRequest.html_url,
        createdAt: pullRequest.created_at,
        updatedAt: pullRequest.updated_at,
        author: pullRequest.user.login,
        authorAvatarUrl: pullRequest.user.avatar_url,
        head: { ref: pullRequest.head.ref, sha: pullRequest.head.sha, repository: pullRequest.head.repo?.full_name ?? null },
        base: { ref: pullRequest.base.ref, sha: pullRequest.base.sha },
      })),
    });
  } catch (error) {
    console.error("Could not list GitHub pull requests", error);
    return Response.json({ error: "No se pudieron cargar los pull requests de GitHub." }, { status: 502 });
  }
}

