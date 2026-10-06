import "server-only";

import { resolveProjectRole, type ProjectVisibility } from "@/lib/project-permissions";
import { buildMcpSearchFilter, createSearchSnippet, normalizeMcpSearchQuery } from "@/lib/mcp/search";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export const MCP_DOCUMENT_TYPES = [
  "project",
  "idea",
  "requirement",
  "task",
  "technology",
  "architecture_decision",
  "diagram",
] as const;

export type McpDocumentType = (typeof MCP_DOCUMENT_TYPES)[number];

type AccessibleProject = {
  id: string;
  workspace_id: string;
  origin_idea_id: string | null;
  creator_id: string;
  title: string;
  objective: string;
  kind: string;
  stage: string;
  visibility: ProjectVisibility;
  created_at: string;
  updated_at: string;
};

async function getAccessibleProject(admin: AdminClient, userId: string, projectId: string) {
  const { data: project, error: projectError } = await admin.from("projects")
    .select("id,workspace_id,origin_idea_id,creator_id,title,objective,kind,stage,visibility,created_at,updated_at")
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

  return { project: project as AccessibleProject, access };
}

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

type SearchableTable = "requirements" | "tasks" | "project_technologies" | "architecture_decisions" | "project_diagrams";
type SearchHit = {
  type: McpDocumentType;
  id: string;
  title: string;
  matchedIn: string;
  snippet: string;
  updatedAt: string;
};

async function searchProjectRows(
  admin: AdminClient,
  table: SearchableTable,
  projectId: string,
  workspaceId: string,
  fields: string[],
  columns: string,
  query: string,
  limit: number,
) {
  const filter = buildMcpSearchFilter(fields, query);
  const request = admin.from(table).select(columns)
    .eq("project_id", projectId)
    .eq("workspace_id", workspaceId)
    .or(filter)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (table === "requirements" || table === "tasks" || table === "project_diagrams") {
    request.neq("status", "archived");
  }
  if (table === "project_technologies") request.neq("status", "rejected");

  const { data, error } = await request;
  if (error) throw new Error("mcp_project_search_failed");
  return (data ?? []) as unknown as Array<Record<string, unknown>>;
}

function fieldText(row: Record<string, unknown>, field: string) {
  const value = row[field];
  return typeof value === "string" ? value : "";
}

function makeSearchHit(
  type: McpDocumentType,
  row: Record<string, unknown>,
  title: string,
  fields: Array<[key: string, label: string]>,
  query: string,
): SearchHit | null {
  const normalizedQuery = normalizeMcpSearchQuery(query).toLocaleLowerCase();
  const matchingField = fields.find(([key]) => fieldText(row, key).toLocaleLowerCase().includes(normalizedQuery));
  if (!matchingField) return null;
  return {
    type,
    id: String(row.id),
    title,
    matchedIn: matchingField[1],
    snippet: createSearchSnippet(fieldText(row, matchingField[0]), query),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  };
}

export async function searchUserProject(
  userId: string,
  projectId: string,
  query: string,
  types: McpDocumentType[] = [...MCP_DOCUMENT_TYPES],
  limit = 20,
) {
  const normalizedQuery = normalizeMcpSearchQuery(query);
  if (normalizedQuery.length < 2) throw new Error("mcp_search_query_too_short");

  const admin = createAdminClient();
  const accessible = await getAccessibleProject(admin, userId, projectId);
  if (!accessible) return null;
  const { project } = accessible;
  const requested = new Set(types.length ? types : MCP_DOCUMENT_TYPES);
  const perTypeLimit = Math.min(Math.max(limit, 1), 50);
  const results: SearchHit[] = [];

  const projectRow = project as unknown as Record<string, unknown>;
  const projectHit = makeSearchHit("project", { ...projectRow, id: project.id }, project.title,
    [["title", "título"], ["objective", "objetivo"]], normalizedQuery);
  if (requested.has("project") && projectHit) results.push(projectHit);

  if (requested.has("idea") && project.origin_idea_id) {
    const { data: idea, error } = await admin.from("ideas")
      .select("id,title,description,tags,kind,status,created_at,updated_at")
      .eq("id", project.origin_idea_id)
      .eq("workspace_id", project.workspace_id)
      .maybeSingle();
    if (error) throw new Error("mcp_project_search_failed");
    if (idea) {
      const tags = Array.isArray(idea.tags) ? idea.tags.join(" ") : "";
      const row = { ...idea, tags_text: tags } as unknown as Record<string, unknown>;
      const hit = makeSearchHit("idea", row, idea.title,
        [["title", "título"], ["description", "notas"], ["tags_text", "etiquetas"]], normalizedQuery);
      if (hit) results.push(hit);
    }
  }

  const searches: Array<{ type: McpDocumentType; rows: Promise<Array<Record<string, unknown>>> }> = [];
  if (requested.has("requirement")) searches.push({ type: "requirement", rows: searchProjectRows(admin, "requirements", projectId,
    project.workspace_id, ["title", "description", "acceptance_criteria"],
    "id,title,description,acceptance_criteria,kind,priority,status,updated_at", normalizedQuery, perTypeLimit) });
  if (requested.has("task")) searches.push({ type: "task", rows: searchProjectRows(admin, "tasks", projectId,
    project.workspace_id, ["title", "description"],
    "id,title,description,status,priority,due_date,updated_at", normalizedQuery, perTypeLimit) });
  if (requested.has("technology")) searches.push({ type: "technology", rows: searchProjectRows(admin, "project_technologies", projectId,
    project.workspace_id, ["name", "version", "rationale"],
    "id,name,category,status,version,rationale,updated_at", normalizedQuery, perTypeLimit) });
  if (requested.has("architecture_decision")) searches.push({ type: "architecture_decision", rows: searchProjectRows(admin, "architecture_decisions", projectId,
    project.workspace_id, ["title", "context", "decision", "consequences"],
    "id,title,status,context,decision,consequences,decided_at,updated_at", normalizedQuery, perTypeLimit) });
  if (requested.has("diagram")) searches.push({ type: "diagram", rows: searchProjectRows(admin, "project_diagrams", projectId,
    project.workspace_id, ["title", "source"],
    "id,title,kind,source,status,updated_at", normalizedQuery, perTypeLimit) });

  const groups = await Promise.all(searches.map(async (search) => ({ type: search.type, rows: await search.rows })));
  for (const { type, rows } of groups) {
    for (const row of rows) {
      const title = String(row.title ?? row.name ?? "");
      const fields: Array<[string, string]> = type === "requirement"
        ? [["title", "título"], ["description", "descripción"], ["acceptance_criteria", "criterios de aceptación"]]
        : type === "task" ? [["title", "título"], ["description", "descripción"]]
        : type === "technology" ? [["name", "tecnología"], ["version", "versión"], ["rationale", "justificación"]]
        : type === "architecture_decision" ? [["title", "título"], ["context", "contexto"], ["decision", "decisión"], ["consequences", "consecuencias"]]
        : [["title", "título"], ["source", "fuente Mermaid"]];
      const hit = makeSearchHit(type, row, title, fields, normalizedQuery);
      if (hit) results.push(hit);
    }
  }

  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { projectId, query: normalizedQuery, total: results.length, results: results.slice(0, perTypeLimit) };
}

export async function fetchUserProjectDocument(userId: string, projectId: string, type: McpDocumentType, documentId: string) {
  const admin = createAdminClient();
  const accessible = await getAccessibleProject(admin, userId, projectId);
  if (!accessible) return null;
  const { project } = accessible;

  if (type === "project") {
    if (documentId !== project.id) return null;
    return {
      type,
      id: project.id,
      title: project.title,
      objective: project.objective,
      kind: project.kind,
      stage: project.stage,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
    };
  }

  if (type === "idea") {
    if (documentId !== project.origin_idea_id) return null;
    const { data, error } = await admin.from("ideas")
      .select("id,title,description,tags,kind,status,author_id,created_at,updated_at")
      .eq("id", documentId).eq("workspace_id", project.workspace_id).maybeSingle();
    if (error) throw new Error("mcp_document_fetch_failed");
    return data ? { type, ...data } : null;
  }

  if (type === "requirement") {
    const { data, error } = await admin.from("requirements")
      .select("id,title,description,acceptance_criteria,kind,priority,status,created_at,updated_at")
      .eq("id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id).maybeSingle();
    if (error) throw new Error("mcp_document_fetch_failed");
    return data ? { type, ...data } : null;
  }

  if (type === "task") {
    const { data: task, error: taskError } = await admin.from("tasks")
      .select("id,title,description,status,priority,due_date,created_at,updated_at")
      .eq("id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id).maybeSingle();
    if (taskError) throw new Error("mcp_document_fetch_failed");
    if (!task) return null;
    const [{ data: checklist, error: checklistError }, { data: links, error: linksError }] = await Promise.all([
      admin.from("checklist_items").select("id,content,position,completed_at,updated_at")
        .eq("task_id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
        .order("position", { ascending: true }),
      admin.from("task_requirements").select("requirement_id")
        .eq("task_id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id),
    ]);
    if (checklistError || linksError) throw new Error("mcp_document_fetch_failed");
    return { type, ...task, checklist: checklist ?? [], requirementIds: (links ?? []).map((item) => item.requirement_id) };
  }

  if (type === "technology") {
    const { data, error } = await admin.from("project_technologies")
      .select("id,name,category,status,version,rationale,created_at,updated_at")
      .eq("id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id).maybeSingle();
    if (error) throw new Error("mcp_document_fetch_failed");
    return data ? { type, ...data } : null;
  }

  if (type === "architecture_decision") {
    const { data, error } = await admin.from("architecture_decisions")
      .select("id,title,status,context,decision,consequences,decided_at,created_at,updated_at")
      .eq("id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id).maybeSingle();
    if (error) throw new Error("mcp_document_fetch_failed");
    return data ? { type, ...data } : null;
  }

  const { data: diagram, error: diagramError } = await admin.from("project_diagrams")
    .select("id,title,kind,source,status,created_at,updated_at")
    .eq("id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id).maybeSingle();
  if (diagramError) throw new Error("mcp_document_fetch_failed");
  if (!diagram) return null;
  const [{ data: versions, error: versionsError }, { data: requirements, error: requirementsError },
    { data: decisions, error: decisionsError }] = await Promise.all([
    admin.from("project_diagram_versions").select("version_number,title,kind,status,change_summary,created_at")
      .eq("diagram_id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
      .order("version_number", { ascending: false }).limit(20),
    admin.from("diagram_requirements").select("requirement_id")
      .eq("diagram_id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id),
    admin.from("diagram_decisions").select("decision_id")
      .eq("diagram_id", documentId).eq("project_id", projectId).eq("workspace_id", project.workspace_id),
  ]);
  if (versionsError || requirementsError || decisionsError) throw new Error("mcp_document_fetch_failed");
  return {
    type,
    ...diagram,
    versions: versions ?? [],
    requirementIds: (requirements ?? []).map((item) => item.requirement_id),
    architectureDecisionIds: (decisions ?? []).map((item) => item.decision_id),
  };
}
