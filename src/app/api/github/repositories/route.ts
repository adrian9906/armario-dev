import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGitHubAppConfig } from "@/lib/github/env";
import { listGitHubInstallationRepositories } from "@/lib/github/repositories";
import { getProjectAccess } from "@/lib/project-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const { userId } = await auth.protect();
  const projectId = new URL(request.url).searchParams.get("project") ?? "";
  if (!uuid.test(projectId)) return Response.json({ error: "Proyecto no válido." }, { status: 400 });

  const access = await getProjectAccess(projectId, userId);
  if (!access?.canManage) return Response.json({ error: "No tienes permiso para gestionar GitHub." }, { status: 403 });

  const config = getGitHubAppConfig();
  if (!config) return Response.json({ error: "La GitHub App no está configurada." }, { status: 503 });

  const { data: installation, error } = await createAdminClient().from("github_installations")
    .select("installation_id,account_login")
    .eq("workspace_id", access.project.workspace_id)
    .eq("status", "active")
    .maybeSingle();
  if (error || !installation)
    return Response.json({ error: "Conecta GitHub en la sección Personas del espacio." }, { status: 409 });

  try {
    const repositories = await listGitHubInstallationRepositories(config, installation.installation_id);
    return Response.json({
      accountLogin: installation.account_login,
      repositories: repositories.map((repository) => ({
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        description: repository.description,
        visibility: repository.visibility ?? (repository.private ? "private" : "public"),
        archived: repository.archived,
        updatedAt: repository.updated_at,
      })),
    });
  } catch (githubError) {
    console.error("Could not list GitHub repositories", githubError);
    return Response.json({ error: "No se pudieron cargar los repositorios de GitHub." }, { status: 502 });
  }
}

