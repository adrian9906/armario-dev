import "server-only";

import { getGitHubAppConfig } from "@/lib/github/env";
import { getProjectAccess } from "@/lib/project-access";
import { createAdminClient } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getLinkedGitHubProject(projectId: string, userId: string) {
  if (!uuid.test(projectId)) return null;
  const access = await getProjectAccess(projectId, userId);
  if (!access) return null;

  const admin = createAdminClient();
  const [{ data: installation }, { data: repository }] = await Promise.all([
    admin.from("github_installations")
      .select("installation_id,account_login,account_type,permissions,status")
      .eq("workspace_id", access.project.workspace_id)
      .eq("status", "active")
      .maybeSingle(),
    admin.from("project_repositories")
      .select("repository_id,owner_login,name,full_name,default_branch,workspace_id")
      .eq("project_id", projectId)
      .eq("workspace_id", access.project.workspace_id)
      .maybeSingle(),
  ]);
  const config = getGitHubAppConfig();
  if (!installation || !repository || !config) return null;

  return { access, admin, config, installation, repository, userId };
}
