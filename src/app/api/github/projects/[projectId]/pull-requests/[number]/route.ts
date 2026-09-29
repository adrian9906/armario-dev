import { auth } from "@clerk/nextjs/server";
import { getLinkedGitHubProject } from "@/lib/github/project-context";
import { getGitHubPullRequestDetail } from "@/lib/github/pull-requests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; number: string }> }) {
  const { userId } = await auth.protect();
  const { projectId, number: rawNumber } = await params;
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(number) || number <= 0) return Response.json({ error: "Pull request no válido." }, { status: 400 });
  const context = await getLinkedGitHubProject(projectId, userId);
  if (!context) return Response.json({ error: "No hay un repositorio vinculado o no tienes acceso." }, { status: 404 });

  try {
    const result = await getGitHubPullRequestDetail(
      context.config,
      context.installation.installation_id,
      context.repository.owner_login,
      context.repository.name,
      number,
    );
    const pullRequest = result.pullRequest;
    return Response.json({
      pullRequest: {
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
        head: { ref: pullRequest.head.ref, sha: pullRequest.head.sha, repository: pullRequest.head.repo?.full_name ?? null },
        base: { ref: pullRequest.base.ref, sha: pullRequest.base.sha },
        mergeable: pullRequest.mergeable,
        mergeableState: pullRequest.mergeable_state,
        additions: pullRequest.additions,
        deletions: pullRequest.deletions,
        changedFiles: pullRequest.changed_files,
        commitCount: pullRequest.commits,
        canDeleteHead: pullRequest.head.repo?.full_name === context.repository.full_name
          && pullRequest.head.ref !== context.repository.default_branch,
      },
      commits: result.commits.map((commit) => ({
        sha: commit.sha,
        htmlUrl: commit.html_url,
        message: commit.commit.message,
        author: commit.author?.login ?? commit.commit.author?.name ?? "GitHub",
        authoredAt: commit.commit.author?.date ?? null,
      })),
      files: result.files.map((file) => ({
        sha: file.sha,
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        blobUrl: file.blob_url,
        patch: file.patch?.slice(0, 20_000) ?? null,
      })),
      reviews: result.reviews.filter((review) => review.state !== "PENDING").map((review) => ({
        id: review.id,
        author: review.user?.login ?? "GitHub",
        body: review.body,
        state: review.state,
        htmlUrl: review.html_url,
        submittedAt: review.submitted_at,
      })),
    });
  } catch (error) {
    console.error("Could not load GitHub pull request", error);
    const status = error instanceof Error && error.message === "github_api_404" ? 404 : 502;
    return Response.json({ error: status === 404 ? "El pull request ya no existe." : "No se pudo cargar el pull request." }, { status });
  }
}

