import { auth } from "@clerk/nextjs/server";
import { getLinkedGitHubProject } from "@/lib/github/project-context";
import { getGitHubCommitDetail } from "@/lib/github/repository-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const commitSha = /^[0-9a-f]{40}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; sha: string }> }) {
  const { userId } = await auth.protect();
  const { projectId, sha } = await params;
  if (!commitSha.test(sha)) return Response.json({ error: "Commit no válido." }, { status: 400 });
  const context = await getLinkedGitHubProject(projectId, userId);
  if (!context) return Response.json({ error: "No hay un repositorio vinculado o no tienes acceso." }, { status: 404 });

  try {
    const commit = await getGitHubCommitDetail(
      context.config,
      context.installation.installation_id,
      context.repository.owner_login,
      context.repository.name,
      sha,
    );
    return Response.json({
      sha: commit.sha,
      htmlUrl: commit.html_url,
      message: commit.commit.message,
      authorName: commit.author?.login ?? commit.commit.author?.name ?? "GitHub",
      authoredAt: commit.commit.author?.date ?? commit.commit.committer?.date ?? null,
      stats: commit.stats,
      files: (commit.files ?? []).map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        blobUrl: file.blob_url,
        patch: file.patch?.slice(0, 12_000) ?? null,
      })),
    });
  } catch (error) {
    console.error("Could not load GitHub commit", error);
    const status = error instanceof Error && error.message === "github_api_404" ? 404 : 502;
    return Response.json({ error: status === 404 ? "El commit ya no existe." : "No se pudo cargar el commit." }, { status });
  }
}
