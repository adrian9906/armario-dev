import "server-only";

import { resolveProjectRole, type ProjectVisibility } from "@/lib/project-permissions";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export function getMcpUserId(context: { http?: { authInfo?: { extra?: Record<string, unknown> } } }) {
  const userId = context.http?.authInfo?.extra?.userId;
  if (typeof userId !== "string" || !userId) throw new Error("mcp_authenticated_user_missing");
  return userId;
}

async function getWorkspaceMembership(admin: AdminClient, workspaceId: string, userId: string) {
  const { data, error } = await admin
    .from("workspace_memberships")
    .select("workspace_id,role,workspaces!inner(id,name,is_personal)")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("mcp_workspace_lookup_failed");
  return data;
}

export async function listUserWorkspaces(userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workspace_memberships")
    .select("workspace_id,role,workspaces!inner(id,name,is_personal)")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(100);

  if (error) throw new Error("mcp_workspace_list_failed");
  return (data ?? []).map((membership) => {
    // PostgREST returns a to-one relation as an object, but some relationship
    // shapes can arrive as an array. Handle both to avoid dropping the name.
    const workspace = Array.isArray(membership.workspaces)
      ? membership.workspaces[0]
      : membership.workspaces;
    return {
      id: membership.workspace_id,
      name: workspace?.name ?? "Espacio sin nombre",
      isPersonal: workspace?.is_personal ?? false,
      role: membership.role,
    };
  });
}

export async function listWorkspaceIdeas(userId: string, workspaceId: string) {
  const admin = createAdminClient();
  const membership = await getWorkspaceMembership(admin, workspaceId, userId);
  if (!membership) return null;

  const { data, error } = await admin.from("ideas")
    .select("id,title,description,kind,status,tags,author_id,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw new Error("mcp_idea_list_failed");
  return data ?? [];
}

export async function listUserProjects(userId: string, workspaceId: string) {
  const admin = createAdminClient();
  const membership = await getWorkspaceMembership(admin, workspaceId, userId);
  if (!membership) return null;

  const [{ data: projects, error: projectError }, { data: explicitMemberships, error: projectMembershipError }] = await Promise.all([
    admin.from("projects")
      .select("id,workspace_id,creator_id,title,objective,kind,stage,visibility,created_at,updated_at")
      .eq("workspace_id", workspaceId)
      .neq("stage", "archived")
      .order("updated_at", { ascending: false })
      .limit(100),
    admin.from("project_memberships")
      .select("project_id,role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId),
  ]);

  if (projectError || projectMembershipError) throw new Error("mcp_project_list_failed");
  const explicitRoles = new Map((explicitMemberships ?? []).map((row) => [row.project_id, row.role]));

  return (projects ?? []).flatMap((project) => {
    const role = resolveProjectRole({
      userId,
      creatorId: project.creator_id,
      visibility: project.visibility as ProjectVisibility,
      workspaceRole: membership.role,
      explicitRole: explicitRoles.get(project.id),
    });
    if (!role) return [];
    return [{
      id: project.id,
      title: project.title,
      objective: project.objective,
      kind: project.kind,
      stage: project.stage,
      access: role,
      updatedAt: project.updated_at,
    }];
  });
}

export async function getUserProjectContext(userId: string, projectId: string) {
  const admin = createAdminClient();
  const { data: project, error: projectError } = await admin.from("projects")
    .select("id,workspace_id,creator_id,title,objective,kind,stage,visibility,created_at,updated_at")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) throw new Error("mcp_project_lookup_failed");
  if (!project) return null;

  const [{ data: membership, error: membershipError }, { data: projectMembership, error: projectMembershipError }] = await Promise.all([
    admin.from("workspace_memberships").select("role")
      .eq("workspace_id", project.workspace_id).eq("user_id", userId).maybeSingle(),
    admin.from("project_memberships").select("role")
      .eq("project_id", project.id).eq("user_id", userId).maybeSingle(),
  ]);

  if (membershipError || projectMembershipError) throw new Error("mcp_project_access_check_failed");
  if (!membership) return null;

  const access = resolveProjectRole({
    userId,
    creatorId: project.creator_id,
    visibility: project.visibility as ProjectVisibility,
    workspaceRole: membership.role,
    explicitRole: projectMembership?.role,
  });
  if (!access) return null;

  const [{ data: requirements, error: requirementsError }, { data: tasks, error: tasksError },
    { data: technologies, error: technologiesError }, { data: decisions, error: decisionsError },
    { data: diagrams, error: diagramsError }] = await Promise.all([
    admin.from("requirements").select("id,title,description,acceptance_criteria,kind,priority,status,updated_at")
      .eq("project_id", project.id).eq("workspace_id", project.workspace_id).neq("status", "archived")
      .order("position", { ascending: true }).limit(25),
    admin.from("tasks").select("id,title,description,status,priority,due_date,assignee_id,updated_at")
      .eq("project_id", project.id).eq("workspace_id", project.workspace_id).neq("status", "archived")
      .order("position", { ascending: true }).limit(25),
    admin.from("project_technologies").select("id,name,category,status,version,rationale")
      .eq("project_id", project.id).eq("workspace_id", project.workspace_id).neq("status", "rejected")
      .order("category", { ascending: true }).limit(25),
    admin.from("architecture_decisions").select("id,title,status,context,decision,consequences,decided_at,updated_at")
      .eq("project_id", project.id).eq("workspace_id", project.workspace_id)
      .order("decided_at", { ascending: false }).limit(25),
    admin.from("project_diagrams").select("id,title,kind,status,updated_at")
      .eq("project_id", project.id).eq("workspace_id", project.workspace_id).eq("status", "active")
      .order("updated_at", { ascending: false }).limit(25),
  ]);

  if (requirementsError || tasksError || technologiesError || decisionsError || diagramsError)
    throw new Error("mcp_project_context_load_failed");

  return {
    project: {
      id: project.id,
      workspaceId: project.workspace_id,
      title: project.title,
      objective: project.objective,
      kind: project.kind,
      stage: project.stage,
      access,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    },
    requirements: requirements ?? [],
    tasks: tasks ?? [],
    technologies: technologies ?? [],
    architectureDecisions: decisions ?? [],
    diagrams: diagrams ?? [],
  };
}
