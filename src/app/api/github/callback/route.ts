import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGitHubAppConfig } from "@/lib/github/env";
import {
  exchangeGitHubUserCode,
  getGitHubAppInstallation,
  getGitHubUserInstallation,
} from "@/lib/github/auth";
import { hashGitHubConnectionState } from "@/lib/github/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dashboardRedirect(request: Request, workspaceId: string | null, message: string) {
  const url = new URL("/dashboard", request.url);
  if (workspaceId) url.searchParams.set("workspace", workspaceId);
  url.searchParams.set("view", "team");
  url.searchParams.set("toast", message);
  return Response.redirect(url);
}

export async function GET(request: Request) {
  const { userId } = await auth.protect();
  const query = new URL(request.url).searchParams;
  const code = query.get("code")?.trim();
  const state = query.get("state")?.trim();
  const installationId = Number(query.get("installation_id"));
  if (!state || !Number.isSafeInteger(installationId) || installationId <= 0)
    return dashboardRedirect(request, null, "GitHub devolvió una conexión incompleta.");

  const config = getGitHubAppConfig();
  if (!config) return dashboardRedirect(request, null, "Completa la configuración de la GitHub App.");

  const admin = createAdminClient();
  const stateHash = hashGitHubConnectionState(state);
  const { data: connectionState } = await admin.from("github_connection_states")
    .select("id,workspace_id,user_id,expires_at,used_at")
    .eq("state_hash", stateHash).maybeSingle();
  if (!connectionState || connectionState.user_id !== userId || connectionState.used_at
    || new Date(connectionState.expires_at).getTime() <= Date.now())
    return dashboardRedirect(request, connectionState?.workspace_id ?? null, "La conexión de GitHub expiró. Inténtalo de nuevo.");

  try {
    // GitHub's installation setup callback normally contains installation_id,
    // setup_action and state, but it does not always include an OAuth code.
    // The App-authenticated endpoint proves that the installation belongs to
    // this GitHub App. When OAuth is present, also verify the installing user.
    const installation = code
      ? await getGitHubUserInstallation(await exchangeGitHubUserCode(config, code), installationId)
      : await getGitHubAppInstallation(config, installationId);
    if (installation.id !== installationId || !installation.account)
      return dashboardRedirect(request, connectionState.workspace_id, "No se pudo verificar la instalación de GitHub.");

    const { data: consumedState } = await admin.from("github_connection_states")
      .update({ used_at: new Date().toISOString() })
      .eq("id", connectionState.id).is("used_at", null)
      .gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (!consumedState)
      return dashboardRedirect(request, connectionState.workspace_id, "Esta conexión de GitHub ya fue utilizada.");

    const { error } = await admin.from("github_installations").upsert({
      workspace_id: connectionState.workspace_id,
      installation_id: installation.id,
      account_id: installation.account.id,
      account_login: installation.account.login,
      account_type: installation.account.type,
      repository_selection: installation.repository_selection,
      permissions: installation.permissions ?? {},
      status: installation.suspended_at ? "suspended" : "active",
      installed_by: userId,
    }, { onConflict: "workspace_id" });
    if (error) throw error;

    return dashboardRedirect(request, connectionState.workspace_id, "GitHub quedó conectado.");
  } catch (error) {
    console.error("GitHub installation callback failed", error);
    return dashboardRedirect(request, connectionState.workspace_id, "No se pudo completar la conexión con GitHub.");
  }
}
