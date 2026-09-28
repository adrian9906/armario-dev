import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getGitHubOAuthConfig, githubAppInstallationUrl } from "@/lib/github/env";
import { createGitHubConnectionState, hashGitHubConnectionState } from "@/lib/github/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dashboardRedirect(request: Request, workspaceId: string, message: string) {
  const url = new URL("/dashboard", request.url);
  if (uuid.test(workspaceId)) url.searchParams.set("workspace", workspaceId);
  url.searchParams.set("view", "team");
  url.searchParams.set("toast", message);
  return Response.redirect(url);
}

export async function GET(request: Request) {
  const { userId } = await auth.protect();
  const workspaceId = new URL(request.url).searchParams.get("workspace") ?? "";
  if (!uuid.test(workspaceId)) return dashboardRedirect(request, "", "El espacio no es válido.");

  const config = getGitHubOAuthConfig();
  if (!config) return dashboardRedirect(request, workspaceId, "Completa la configuración de la GitHub App.");

  const db = createClient();
  const { data: membership } = await db.from("workspace_memberships").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role))
    return dashboardRedirect(request, workspaceId, "No tienes permiso para conectar GitHub.");

  const state = createGitHubConnectionState();
  const { error } = await createAdminClient().from("github_connection_states").insert({
    workspace_id: workspaceId,
    user_id: userId,
    state_hash: hashGitHubConnectionState(state),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) return dashboardRedirect(request, workspaceId, "No se pudo iniciar la conexión con GitHub.");

  const installationUrl = new URL(githubAppInstallationUrl(config));
  installationUrl.searchParams.set("state", state);
  return Response.redirect(installationUrl);
}
