import "server-only";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { decisionStatuses, diagramKinds, technologyByKey, technologyStatuses } from "@/lib/documentation-model";
import { moduleOptions, projectKinds, projectStages, requirementKinds, requirementPriorities, taskPriorities, taskStatuses } from "@/lib/project-model";
import { runDocumentGitHubAutomation, runTaskGitHubAutomation } from "@/lib/github/automation";
import { getAccessibleProject } from "@/lib/mcp/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMcpSupabaseClient } from "@/lib/supabase/mcp";
import { validTaskDates } from "@/lib/task-dates";

const ideaKinds = ["web", "mobile", "frontend", "backend", "mixed", "other", "undecided"] as const;
const projectRolesCanEdit = new Set(["manager", "editor"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function scheduleTaskAutomation(projectId: string, taskId: string, trigger: "created" | "updated" | "status_changed") {
  after(() => runTaskGitHubAutomation({ projectId, taskId, trigger }).catch((error) => {
    console.error("MCP task automation failed", { projectId, taskId, trigger, error });
  }));
}

function scheduleDocumentAutomation(projectId: string, sourceType: "requirement" | "decision" | "diagram", sourceId: string, actorId: string) {
  after(() => runDocumentGitHubAutomation({ projectId, sourceType, sourceId, actorId }).catch((error) => {
    console.error("MCP document automation failed", { projectId, sourceType, sourceId, error });
  }));
}

function refreshProject(projectId: string, extraPath?: string) {
  revalidatePath("/dashboard", "page");
  revalidatePath(`/projects/${projectId}`);
  if (extraPath) revalidatePath(extraPath);
}

async function accessibleProject(userId: string, projectId: string) {
  if (!uuid.test(projectId)) return null;
  return getAccessibleProject(createAdminClient(), userId, projectId);
}

function requireProjectEditor(access: Awaited<ReturnType<typeof accessibleProject>>) {
  if (!access || !projectRolesCanEdit.has(access.access)) throw new Error("mcp_project_write_forbidden");
  return access.project;
}

async function workableTask(userId: string, projectId: string, taskId: string) {
  const access = await accessibleProject(userId, projectId);
  if (!access) return null;
  if (projectRolesCanEdit.has(access.access)) return access;
  if (access.access !== "contributor") return null;
  const { data: task } = await createAdminClient().from("tasks").select("assignee_id")
    .eq("id", taskId).eq("project_id", projectId).maybeSingle();
  return task?.assignee_id === userId ? access : null;
}

async function editableProject(userId: string, projectId: string, accessToken: string) {
  if (!uuid.test(projectId)) return null;
  const admin = createAdminClient();
  const accessible = await getAccessibleProject(admin, userId, projectId);
  if (!accessible || !projectRolesCanEdit.has(accessible.access)) return null;
  return { admin, user: createMcpSupabaseClient(accessToken), ...accessible };
}

async function ideaWorkspaceRole(userId: string, workspaceId: string, accessToken: string) {
  if (!uuid.test(workspaceId)) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.from("workspace_memberships").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("mcp_idea_membership_lookup_failed");
  return data && ["owner", "admin", "editor"].includes(data.role) ? createMcpSupabaseClient(accessToken) : null;
}

function normalizedTags(tags: string[]) {
  const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  if (normalized.length > 12 || normalized.some((tag) => tag.length > 30)) throw new Error("mcp_idea_invalid_tags");
  return normalized;
}

function validateIdea(title: string, description: string, kind: string, tags: string[]) {
  if (!title.trim() || title.trim().length > 160 || description.length > 10000 || !ideaKinds.includes(kind as typeof ideaKinds[number]))
    throw new Error("mcp_idea_invalid_input");
  return { title: title.trim(), description, kind, tags: normalizedTags(tags) };
}

export async function createMcpIdea(userId: string, accessToken: string, input: {
  workspaceId: string; title: string; description: string; kind: string; tags: string[];
}) {
  const user = await ideaWorkspaceRole(userId, input.workspaceId, accessToken);
  if (!user) throw new Error("mcp_idea_write_forbidden");
  const fields = validateIdea(input.title, input.description, input.kind, input.tags);
  const { data, error } = await user.from("ideas").insert({
    workspace_id: input.workspaceId, author_id: userId, ...fields,
  }).select("id").single();
  if (error || !data) throw new Error("mcp_idea_create_failed");
  revalidatePath("/dashboard", "page");
  return { id: data.id, ...fields, workspaceId: input.workspaceId, status: "active" };
}

export async function updateMcpIdea(userId: string, accessToken: string, input: {
  workspaceId: string; ideaId: string; title: string; description: string; kind: string; tags: string[];
}) {
  const user = await ideaWorkspaceRole(userId, input.workspaceId, accessToken);
  if (!user) throw new Error("mcp_idea_write_forbidden");
  if (!uuid.test(input.ideaId)) throw new Error("mcp_idea_invalid_id");
  const fields = validateIdea(input.title, input.description, input.kind, input.tags);
  const { data, error } = await user.from("ideas").update(fields)
    .eq("id", input.ideaId).eq("workspace_id", input.workspaceId).eq("status", "active")
    .select("id").maybeSingle();
  if (error || !data) throw new Error("mcp_idea_update_failed");
  revalidatePath("/dashboard", "page");
  revalidatePath(`/ideas/${input.ideaId}`, "page");
  return { id: data.id, workspaceId: input.workspaceId, ...fields };
}

export async function setMcpIdeaStatus(userId: string, accessToken: string, input: { workspaceId: string; ideaId: string; status: "active" | "archived" }) {
  const user = await ideaWorkspaceRole(userId, input.workspaceId, accessToken);
  if (!user) throw new Error("mcp_idea_write_forbidden");
  if (!uuid.test(input.ideaId)) throw new Error("mcp_idea_invalid_id");
  const { data, error } = await user.from("ideas").update({ status: input.status })
    .eq("id", input.ideaId).eq("workspace_id", input.workspaceId).neq("status", "converted")
    .select("id,status").maybeSingle();
  if (error || !data) throw new Error("mcp_idea_status_update_failed");
  revalidatePath("/dashboard", "page");
  revalidatePath(`/ideas/${input.ideaId}`, "page");
  return { id: data.id, workspaceId: input.workspaceId, status: data.status };
}

function validateTask(input: {
  title: string; description: string; status?: string; priority?: string; assigneeId?: string | null;
  startDate?: string | null; dueDate?: string | null; checklist?: string[];
}) {
  const title = input.title.trim();
  const description = input.description ?? "";
  const status = input.status ?? "todo";
  const priority = input.priority ?? "medium";
  const startDate = input.startDate || null;
  const dueDate = input.dueDate || null;
  const checklist = (input.checklist ?? []).map((item) => item.trim()).filter(Boolean);
  if (!title || title.length > 160 || description.length > 10000
    || !taskStatuses.some((item) => item.value === status)
    || !taskPriorities.some((item) => item.value === priority)
    || !validTaskDates(startDate, dueDate)
    || checklist.length > 30 || checklist.some((item) => item.length > 300)) throw new Error("mcp_task_invalid_input");
  if (input.assigneeId && !uuid.test(input.assigneeId)) throw new Error("mcp_task_invalid_assignee");
  return { title, description, status, priority, assigneeId: input.assigneeId ?? null, startDate, dueDate, checklist };
}

async function validAssignee(admin: ReturnType<typeof createAdminClient>, workspaceId: string, assigneeId: string | null) {
  if (!assigneeId) return true;
  const { data, error } = await admin.from("workspace_memberships").select("user_id")
    .eq("workspace_id", workspaceId).eq("user_id", assigneeId).maybeSingle();
  if (error) throw new Error("mcp_task_assignee_lookup_failed");
  return !!data;
}

export async function createMcpTask(userId: string, accessToken: string, input: {
  projectId: string; title: string; description?: string; status?: string; priority?: string; assigneeId?: string | null;
  startDate?: string | null; dueDate?: string | null; checklist?: string[];
}) {
  const context = await editableProject(userId, input.projectId, accessToken);
  if (!context) throw new Error("mcp_project_write_forbidden");
  const fields = validateTask({ ...input, description: input.description ?? "" });
  if (!await validAssignee(context.admin, context.project.workspace_id, fields.assigneeId)) throw new Error("mcp_task_assignee_not_member");
  const { data: taskId, error } = await context.user.rpc("create_task_with_checklist", {
    target_project_id: input.projectId, task_title: fields.title, task_description: fields.description,
    task_status: fields.status, task_priority: fields.priority, target_assignee_id: fields.assigneeId,
    target_start_date: fields.startDate, target_due_date: fields.dueDate, checklist_contents: fields.checklist,
  });
  if (error || !taskId) throw new Error("mcp_task_create_failed");
  scheduleTaskAutomation(input.projectId, taskId, "created");
  refreshProject(input.projectId, `/projects/${input.projectId}/tasks/${taskId}`);
  return { id: taskId, ...fields, projectId: input.projectId };
}

export async function updateMcpTask(userId: string, accessToken: string, input: {
  projectId: string; taskId: string; title?: string; description?: string; priority?: string; assigneeId?: string | null;
  startDate?: string | null; dueDate?: string | null;
}) {
  const context = await editableProject(userId, input.projectId, accessToken);
  if (!context) throw new Error("mcp_project_write_forbidden");
  if (!uuid.test(input.taskId)) throw new Error("mcp_task_invalid_id");
  const { data: existing, error: lookupError } = await context.admin.from("tasks")
    .select("id,title,description,status,priority,assignee_id,start_date,due_date")
    .eq("id", input.taskId).eq("project_id", input.projectId).eq("workspace_id", context.project.workspace_id).maybeSingle();
  if (lookupError || !existing || existing.status === "archived") throw new Error("mcp_task_not_found");
  const values: Record<string, string | null> = {};
  if (input.title !== undefined) values.title = input.title.trim();
  if (input.description !== undefined) values.description = input.description;
  if (input.priority !== undefined) values.priority = input.priority;
  if (input.assigneeId !== undefined) values.assignee_id = input.assigneeId;
  if (input.startDate !== undefined) values.start_date = input.startDate || null;
  if (input.dueDate !== undefined) values.due_date = input.dueDate || null;
  if (!Object.keys(values).length) throw new Error("mcp_task_no_changes");
  const title = String(values.title ?? existing.title);
  const description = String(values.description ?? existing.description);
  const priority = String(values.priority ?? existing.priority);
  const assigneeId = (values.assignee_id === undefined ? existing.assignee_id : values.assignee_id) as string | null;
  const startDate = (values.start_date === undefined ? existing.start_date : values.start_date) as string | null;
  const dueDate = (values.due_date === undefined ? existing.due_date : values.due_date) as string | null;
  validateTask({ title, description, status: existing.status, priority, assigneeId, startDate, dueDate });
  if (!await validAssignee(context.admin, context.project.workspace_id, assigneeId)) throw new Error("mcp_task_assignee_not_member");
  const { data, error } = await context.user.from("tasks").update(values)
    .eq("id", input.taskId).eq("project_id", input.projectId).eq("workspace_id", context.project.workspace_id)
    .select("id,title,description,status,priority,assignee_id,start_date,due_date").maybeSingle();
  if (error || !data) throw new Error("mcp_task_update_failed");
  scheduleTaskAutomation(input.projectId, input.taskId, "updated");
  refreshProject(input.projectId, `/projects/${input.projectId}/tasks/${input.taskId}`);
  return data;
}

export async function updateMcpTaskStatus(userId: string, accessToken: string, input: { projectId: string; taskId: string; status: string }) {
  const context = await editableProject(userId, input.projectId, accessToken);
  if (!context) {
    if (!uuid.test(input.projectId) || !uuid.test(input.taskId)) throw new Error("mcp_task_invalid_id");
    const admin = createAdminClient();
    const accessible = await getAccessibleProject(admin, userId, input.projectId);
    if (!accessible || accessible.access !== "contributor") throw new Error("mcp_task_write_forbidden");
    const { data: task, error } = await admin.from("tasks").select("id,assignee_id")
      .eq("id", input.taskId).eq("project_id", input.projectId).maybeSingle();
    if (error || !task || task.assignee_id !== userId) throw new Error("mcp_task_write_forbidden");
    const user = createMcpSupabaseClient(accessToken);
    const { data, error: updateError } = await user.from("tasks").update({ status: input.status })
      .eq("id", input.taskId).eq("project_id", input.projectId).select("id,status").maybeSingle();
    if (updateError || !data || ![...taskStatuses.map((item) => item.value), "archived"].includes(input.status))
      throw new Error("mcp_task_status_update_failed");
    scheduleTaskAutomation(input.projectId, input.taskId, "status_changed");
    refreshProject(input.projectId, `/projects/${input.projectId}/tasks/${input.taskId}`);
    return data;
  }
  if (!uuid.test(input.taskId) || ![...taskStatuses.map((item) => item.value), "archived"].includes(input.status))
    throw new Error("mcp_task_invalid_status");
  const { data, error } = await context.user.from("tasks").update({ status: input.status })
    .eq("id", input.taskId).eq("project_id", input.projectId).eq("workspace_id", context.project.workspace_id)
    .select("id,status").maybeSingle();
  if (error || !data) throw new Error("mcp_task_status_update_failed");
  scheduleTaskAutomation(input.projectId, input.taskId, "status_changed");
  refreshProject(input.projectId, `/projects/${input.projectId}/tasks/${input.taskId}`);
  return data;
}

function validateRequirement(input: { title: string; description?: string; acceptanceCriteria?: string; kind?: string; priority?: string }) {
  const title = input.title.trim();
  const description = input.description ?? "";
  const acceptance_criteria = input.acceptanceCriteria ?? "";
  const kind = input.kind ?? "functional";
  const priority = input.priority ?? "must";
  if (!title || title.length > 160 || description.length > 10000 || acceptance_criteria.length > 10000
    || !requirementKinds.some((item) => item.value === kind) || !requirementPriorities.some((item) => item.value === priority))
    throw new Error("mcp_requirement_invalid_input");
  return { title, description, acceptance_criteria, kind, priority };
}

export async function createMcpRequirement(userId: string, accessToken: string, input: {
  projectId: string; title: string; description?: string; acceptanceCriteria?: string; kind?: string; priority?: string;
}) {
  const context = await editableProject(userId, input.projectId, accessToken);
  if (!context) throw new Error("mcp_project_write_forbidden");
  const fields = validateRequirement(input);
  const { data, error } = await context.user.from("requirements").insert({
    ...fields, project_id: input.projectId, workspace_id: context.project.workspace_id, creator_id: userId,
  }).select("id,title,description,acceptance_criteria,kind,priority,status").single();
  if (error || !data) throw new Error("mcp_requirement_create_failed");
  scheduleDocumentAutomation(input.projectId, "requirement", data.id, userId);
  refreshProject(input.projectId, `/projects/${input.projectId}/requirements/${data.id}`);
  return { ...data, projectId: input.projectId };
}

export async function updateMcpRequirement(userId: string, accessToken: string, input: {
  projectId: string; requirementId: string; title?: string; description?: string; acceptanceCriteria?: string;
  kind?: string; priority?: string; status?: "active" | "archived";
}) {
  const context = await editableProject(userId, input.projectId, accessToken);
  if (!context) throw new Error("mcp_project_write_forbidden");
  if (!uuid.test(input.requirementId)) throw new Error("mcp_requirement_invalid_id");
  const { data: existing, error: lookupError } = await context.admin.from("requirements")
    .select("id,title,description,acceptance_criteria,kind,priority,status")
    .eq("id", input.requirementId).eq("project_id", input.projectId).eq("workspace_id", context.project.workspace_id).maybeSingle();
  if (lookupError || !existing) throw new Error("mcp_requirement_not_found");
  const values: Record<string, string> = {};
  for (const key of ["title", "description", "kind", "priority"] as const) if (input[key] !== undefined) values[key] = input[key]!;
  if (input.acceptanceCriteria !== undefined) values.acceptance_criteria = input.acceptanceCriteria;
  if (input.status !== undefined) values.status = input.status;
  if (!Object.keys(values).length) throw new Error("mcp_requirement_no_changes");
  validateRequirement({
    title: String(values.title ?? existing.title), description: String(values.description ?? existing.description),
    acceptanceCriteria: String(values.acceptance_criteria ?? existing.acceptance_criteria),
    kind: String(values.kind ?? existing.kind), priority: String(values.priority ?? existing.priority),
  });
  if (values.status && !["active", "archived"].includes(values.status)) throw new Error("mcp_requirement_invalid_status");
  const { data, error } = await context.user.from("requirements").update(values)
    .eq("id", input.requirementId).eq("project_id", input.projectId).eq("workspace_id", context.project.workspace_id)
    .select("id,title,description,acceptance_criteria,kind,priority,status").maybeSingle();
  if (error || !data) throw new Error("mcp_requirement_update_failed");
  scheduleDocumentAutomation(input.projectId, "requirement", input.requirementId, userId);
  refreshProject(input.projectId, `/projects/${input.projectId}/requirements/${input.requirementId}`);
  return data;
}

function validateDecision(input: { title: string; context?: string; decision?: string; consequences?: string; status?: string; decidedAt?: string }) {
  const title = input.title.trim();
  const context = input.context ?? "";
  const decision = input.decision ?? "";
  const consequences = input.consequences ?? "";
  const status = input.status ?? "proposed";
  const decided_at = input.decidedAt ?? new Date().toISOString().slice(0, 10);
  if (!title || title.length > 160 || context.length > 10000 || decision.length > 10000 || consequences.length > 10000
    || !decisionStatuses.some((item) => item.value === status) || !/^\d{4}-\d{2}-\d{2}$/.test(decided_at)
    || Number.isNaN(Date.parse(decided_at)) || new Date(decided_at).toISOString().slice(0, 10) !== decided_at)
    throw new Error("mcp_adr_invalid_input");
  return { title, context, decision, consequences, status, decided_at };
}

export async function createMcpDecision(userId: string, accessToken: string, input: {
  projectId: string; title: string; context?: string; decision?: string; consequences?: string; status?: string; decidedAt?: string;
}) {
  const context = await editableProject(userId, input.projectId, accessToken);
  if (!context) throw new Error("mcp_project_write_forbidden");
  const fields = validateDecision(input);
  const { data, error } = await context.user.from("architecture_decisions").insert({
    ...fields, project_id: input.projectId, workspace_id: context.project.workspace_id, creator_id: userId,
  }).select("id,title,status,context,decision,consequences,decided_at,updated_at").single();
  if (error || !data) throw new Error("mcp_adr_create_failed");
  scheduleDocumentAutomation(input.projectId, "decision", data.id, userId);
  refreshProject(input.projectId, `/projects/${input.projectId}/documentation/decisions/${data.id}`);
  return { ...data, projectId: input.projectId };
}

export async function updateMcpDecision(userId: string, accessToken: string, input: {
  projectId: string; decisionId: string; title?: string; context?: string; decision?: string;
  consequences?: string; status?: string; decidedAt?: string;
}) {
  const access = await editableProject(userId, input.projectId, accessToken);
  if (!access) throw new Error("mcp_project_write_forbidden");
  if (!uuid.test(input.decisionId)) throw new Error("mcp_adr_invalid_id");
  const { data: existing, error: lookupError } = await access.admin.from("architecture_decisions")
    .select("id,title,status,context,decision,consequences,decided_at")
    .eq("id", input.decisionId).eq("project_id", input.projectId).eq("workspace_id", access.project.workspace_id).maybeSingle();
  if (lookupError || !existing) throw new Error("mcp_adr_not_found");
  const values: Record<string, string> = {};
  for (const key of ["title", "context", "decision", "consequences", "status"] as const) if (input[key] !== undefined) values[key] = input[key]!;
  if (input.decidedAt !== undefined) values.decided_at = input.decidedAt;
  if (!Object.keys(values).length) throw new Error("mcp_adr_no_changes");
  validateDecision({
    title: values.title ?? existing.title, context: values.context ?? existing.context,
    decision: values.decision ?? existing.decision, consequences: values.consequences ?? existing.consequences,
    status: values.status ?? existing.status, decidedAt: values.decided_at ?? existing.decided_at,
  });
  const { data, error } = await access.user.from("architecture_decisions").update(values)
    .eq("id", input.decisionId).eq("project_id", input.projectId).eq("workspace_id", access.project.workspace_id)
    .select("id,title,status,context,decision,consequences,decided_at,updated_at").maybeSingle();
  if (error || !data) throw new Error("mcp_adr_update_failed");
  scheduleDocumentAutomation(input.projectId, "decision", input.decisionId, userId);
  refreshProject(input.projectId, `/projects/${input.projectId}/documentation/decisions/${input.decisionId}`);
  return data;
}

export async function createMcpProject(userId: string, accessToken: string, input: {
  workspaceId: string; title: string; objective?: string; kind: string; stage?: string;
  modules?: Partial<Record<"frontend" | "backend" | "database" | "auth", boolean>>;
}) {
  if (!uuid.test(input.workspaceId)) throw new Error("mcp_workspace_invalid_id");
  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin.from("workspace_memberships")
    .select("role").eq("workspace_id", input.workspaceId).eq("user_id", userId).maybeSingle();
  if (membershipError || !membership || !["owner", "admin", "editor"].includes(membership.role))
    throw new Error("mcp_project_write_forbidden");
  const title = input.title.trim();
  const objective = input.objective ?? "";
  const stage = input.stage ?? "definition";
  if (!title || title.length > 160 || objective.length > 10000
    || !projectKinds.some((item) => item.value === input.kind)
    || !projectStages.some((item) => item.value === stage)) throw new Error("mcp_project_invalid_input");
  const modules = Object.fromEntries(moduleOptions.map((option) => [option.value, input.modules?.[option.value] === true]));
  if (input.modules && Object.keys(input.modules).some((key) => !moduleOptions.some((option) => option.value === key)))
    throw new Error("mcp_project_invalid_modules");
  const db = createMcpSupabaseClient(accessToken);
  const { data, error } = await db.from("projects").insert({
    workspace_id: input.workspaceId, creator_id: userId, title, objective, kind: input.kind, stage, modules,
  }).select("id,title,objective,kind,stage,modules").single();
  if (error || !data) throw new Error("mcp_project_create_failed");
  refreshProject(data.id);
  return { ...data, workspaceId: input.workspaceId };
}

export async function convertMcpIdeaToProject(userId: string, accessToken: string, input: {
  ideaId: string; kind: string; objective?: string;
  modules?: Partial<Record<"frontend" | "backend" | "database" | "auth", boolean>>;
}) {
  if (!uuid.test(input.ideaId) || !projectKinds.some((item) => item.value === input.kind) || (input.objective ?? "").length > 10000)
    throw new Error("mcp_project_invalid_input");
  const modules = Object.fromEntries(moduleOptions.map((option) => [option.value, input.modules?.[option.value] === true]));
  if (input.modules && Object.keys(input.modules).some((key) => !moduleOptions.some((option) => option.value === key)))
    throw new Error("mcp_project_invalid_modules");
  const db = createMcpSupabaseClient(accessToken);
  const { data: projectId, error } = await db.rpc("convert_idea_to_project", {
    target_idea_id: input.ideaId, target_kind: input.kind, selected_modules: modules, target_objective: input.objective ?? "",
  });
  if (error || !projectId) throw new Error("mcp_project_conversion_failed");
  revalidatePath("/dashboard", "page");
  refreshProject(projectId);
  return { projectId, originIdeaId: input.ideaId };
}

export async function updateMcpProject(userId: string, accessToken: string, input: {
  projectId: string; title?: string; objective?: string; kind?: string; stage?: string;
  modules?: Partial<Record<"frontend" | "backend" | "database" | "auth", boolean>>;
}) {
  const project = requireProjectEditor(await accessibleProject(userId, input.projectId));
  const values: Record<string, unknown> = {};
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title || title.length > 160) throw new Error("mcp_project_invalid_title");
    values.title = title;
  }
  if (input.objective !== undefined) {
    if (input.objective.length > 10000) throw new Error("mcp_project_invalid_objective");
    values.objective = input.objective;
  }
  if (input.kind !== undefined) {
    if (!projectKinds.some((item) => item.value === input.kind)) throw new Error("mcp_project_invalid_kind");
    values.kind = input.kind;
  }
  if (input.stage !== undefined) {
    if (!projectStages.some((item) => item.value === input.stage)) throw new Error("mcp_project_invalid_stage");
    values.stage = input.stage;
  }
  if (input.modules !== undefined) {
    if (Object.keys(input.modules).some((key) => !moduleOptions.some((option) => option.value === key)))
      throw new Error("mcp_project_invalid_modules");
    const admin = createAdminClient();
    const { data: current, error: currentError } = await admin.from("projects").select("modules")
      .eq("id", input.projectId).maybeSingle();
    if (currentError || !current) throw new Error("mcp_project_lookup_failed");
    values.modules = Object.fromEntries(moduleOptions.map((option) => [
      option.value,
      input.modules?.[option.value] ?? (current.modules as Record<string, boolean>)[option.value] ?? false,
    ]));
  }
  if (!Object.keys(values).length) throw new Error("mcp_project_no_changes");
  const db = createMcpSupabaseClient(accessToken);
  const { data, error } = await db.from("projects").update(values).eq("id", input.projectId)
    .eq("workspace_id", project.workspace_id).select("id,title,objective,kind,stage,modules").maybeSingle();
  if (error || !data) throw new Error("mcp_project_update_failed");
  refreshProject(input.projectId);
  return data;
}

export async function moveMcpProjectItem(userId: string, accessToken: string, input: {
  projectId: string; entity: "task" | "requirement"; entityId: string; direction: "up" | "down";
}) {
  requireProjectEditor(await accessibleProject(userId, input.projectId));
  if (!uuid.test(input.entityId)) throw new Error("mcp_item_invalid_id");
  const db = createMcpSupabaseClient(accessToken);
  const rpc = input.entity === "task" ? "move_project_task" : "move_project_requirement";
  const arg = input.entity === "task" ? "target_task_id" : "target_requirement_id";
  const { data, error } = await db.rpc(rpc, { [arg]: input.entityId, direction: input.direction });
  if (error || !data) throw new Error("mcp_item_move_failed");
  refreshProject(input.projectId);
  return { projectId: input.projectId, id: input.entityId, entity: input.entity, direction: input.direction };
}

export async function setMcpRequirementStatus(userId: string, accessToken: string, input: {
  projectId: string; requirementId: string; status: "active" | "archived";
}) {
  const access = await editableProject(userId, input.projectId, accessToken);
  if (!access || !uuid.test(input.requirementId)) throw new Error("mcp_requirement_write_forbidden");
  const { data, error } = await access.user.from("requirements").update({ status: input.status })
    .eq("id", input.requirementId).eq("project_id", input.projectId).eq("workspace_id", access.project.workspace_id)
    .select("id,status").maybeSingle();
  if (error || !data) throw new Error("mcp_requirement_status_update_failed");
  scheduleDocumentAutomation(input.projectId, "requirement", input.requirementId, userId);
  refreshProject(input.projectId);
  return data;
}

export async function addMcpChecklistItem(userId: string, accessToken: string, input: {
  projectId: string; taskId: string; content: string;
}) {
  const access = await workableTask(userId, input.projectId, input.taskId);
  const content = input.content.trim();
  if (!access || !content || content.length > 300) throw new Error("mcp_checklist_invalid_input");
  const admin = createAdminClient();
  const { data: last, error: lookupError } = await admin.from("checklist_items").select("position")
    .eq("task_id", input.taskId).order("position", { ascending: false }).limit(1).maybeSingle();
  if (lookupError) throw new Error("mcp_checklist_lookup_failed");
  const db = createMcpSupabaseClient(accessToken);
  const { data, error } = await db.from("checklist_items").insert({
    workspace_id: access.project.workspace_id, project_id: input.projectId, task_id: input.taskId,
    content, position: (last?.position ?? 0) + 1,
  }).select("id,content,position,completed_at").single();
  if (error || !data) throw new Error("mcp_checklist_create_failed");
  refreshProject(input.projectId, `/projects/${input.projectId}/tasks/${input.taskId}`);
  return data;
}

export async function toggleMcpChecklistItem(userId: string, accessToken: string, input: {
  projectId: string; taskId: string; itemId: string; completed: boolean;
}) {
  const access = await workableTask(userId, input.projectId, input.taskId);
  if (!access || !uuid.test(input.itemId)) throw new Error("mcp_checklist_write_forbidden");
  const db = createMcpSupabaseClient(accessToken);
  const { data, error } = await db.from("checklist_items").update({ completed_at: input.completed ? new Date().toISOString() : null })
    .eq("id", input.itemId).eq("task_id", input.taskId).eq("project_id", input.projectId)
    .select("id,content,position,completed_at").maybeSingle();
  if (error || !data) throw new Error("mcp_checklist_update_failed");
  refreshProject(input.projectId, `/projects/${input.projectId}/tasks/${input.taskId}`);
  return data;
}

export async function linkMcpTaskRequirement(userId: string, accessToken: string, input: {
  projectId: string; taskId: string; requirementId: string; linked: boolean;
}) {
  const access = await editableProject(userId, input.projectId, accessToken);
  if (!access || !uuid.test(input.taskId) || !uuid.test(input.requirementId)) throw new Error("mcp_traceability_write_forbidden");
  const admin = createAdminClient();
  const [{ data: task }, { data: requirement }] = await Promise.all([
    admin.from("tasks").select("id").eq("id", input.taskId).eq("project_id", input.projectId).maybeSingle(),
    admin.from("requirements").select("id").eq("id", input.requirementId).eq("project_id", input.projectId).maybeSingle(),
  ]);
  if (!task || !requirement) throw new Error("mcp_traceability_target_not_found");
  const db = createMcpSupabaseClient(accessToken);
  const request = db.from("task_requirements");
  const result = input.linked
    ? await request.insert({ workspace_id: access.project.workspace_id, project_id: input.projectId, task_id: input.taskId, requirement_id: input.requirementId })
    : await request.delete().eq("task_id", input.taskId).eq("requirement_id", input.requirementId).eq("project_id", input.projectId);
  if (result.error) throw new Error("mcp_traceability_update_failed");
  refreshProject(input.projectId, `/projects/${input.projectId}/tasks/${input.taskId}`);
  return { taskId: input.taskId, requirementId: input.requirementId, linked: input.linked };
}

export async function addMcpComment(userId: string, accessToken: string, input: {
  projectId: string; targetType: "task" | "requirement"; targetId: string; content: string;
}) {
  const access = await accessibleProject(userId, input.projectId);
  if (!access || !["manager", "editor", "contributor"].includes(access.access) || !uuid.test(input.targetId))
    throw new Error("mcp_comment_forbidden");
  const content = input.content.trim();
  if (!content || content.length > 5000) throw new Error("mcp_comment_invalid_input");
  const admin = createAdminClient();
  const table = input.targetType === "task" ? "tasks" : "requirements";
  const { data: target } = await admin.from(table).select("id").eq("id", input.targetId).eq("project_id", input.projectId).maybeSingle();
  if (!target) throw new Error("mcp_comment_target_not_found");
  const db = createMcpSupabaseClient(accessToken);
  const { data, error } = await db.from("project_comments").insert({
    workspace_id: access.project.workspace_id, project_id: input.projectId, author_id: userId, content,
    task_id: input.targetType === "task" ? input.targetId : null,
    requirement_id: input.targetType === "requirement" ? input.targetId : null,
  }).select("id,content,created_at,task_id,requirement_id").single();
  if (error || !data) throw new Error("mcp_comment_create_failed");
  refreshProject(input.projectId);
  return data;
}

export async function listMcpComments(userId: string, input: {
  projectId: string; targetType?: "task" | "requirement"; targetId?: string; limit?: number;
}) {
  const access = await accessibleProject(userId, input.projectId);
  if (!access) throw new Error("mcp_project_access_denied");
  if (input.targetId && !uuid.test(input.targetId)) throw new Error("mcp_comment_invalid_target");
  if ((input.targetType && !input.targetId) || (!input.targetType && input.targetId))
    throw new Error("mcp_comment_target_pair_required");
  const admin = createAdminClient();
  let query = admin.from("project_comments")
    .select("id,content,created_at,author_id,task_id,requirement_id")
    .eq("project_id", input.projectId).eq("workspace_id", access.project.workspace_id)
    .order("created_at", { ascending: false }).limit(Math.min(Math.max(input.limit ?? 50, 1), 100));
  if (input.targetType === "task" && input.targetId) query = query.eq("task_id", input.targetId);
  if (input.targetType === "requirement" && input.targetId) query = query.eq("requirement_id", input.targetId);
  const { data, error } = await query;
  if (error) throw new Error("mcp_comments_load_failed");
  return data ?? [];
}

export async function saveMcpTechnology(userId: string, accessToken: string, input: {
  projectId: string; technologyId?: string; technologyKey: string; status: string; version?: string; rationale?: string;
}) {
  const access = await editableProject(userId, input.projectId, accessToken);
  if (!access || (input.technologyId && !uuid.test(input.technologyId))) throw new Error("mcp_technology_write_forbidden");
  const technology = technologyByKey(input.technologyKey);
  const version = input.version ?? "";
  const rationale = input.rationale ?? "";
  if (!technology || !technologyStatuses.some((item) => item.value === input.status) || version.length > 80 || rationale.length > 5000)
    throw new Error("mcp_technology_invalid_input");
  const values = { name: technology.name, category: technology.category, status: input.status, version, rationale };
  const query = access.user.from("project_technologies");
  const result = input.technologyId
    ? await query.update(values).eq("id", input.technologyId).eq("project_id", input.projectId).eq("workspace_id", access.project.workspace_id).select("id,name,category,status,version,rationale").maybeSingle()
    : await query.insert({ ...values, project_id: input.projectId, workspace_id: access.project.workspace_id, creator_id: userId }).select("id,name,category,status,version,rationale").single();
  if (result.error || !result.data) throw new Error("mcp_technology_save_failed");
  refreshProject(input.projectId);
  return result.data;
}

export async function saveMcpDiagram(userId: string, accessToken: string, input: {
  projectId: string; diagramId?: string; title: string; kind: string; source: string; status?: "active" | "archived"; changeSummary?: string;
}) {
  const access = await editableProject(userId, input.projectId, accessToken);
  if (!access || (input.diagramId && !uuid.test(input.diagramId))) throw new Error("mcp_diagram_write_forbidden");
  const title = input.title.trim();
  const status = input.status ?? "active";
  const changeSummary = input.changeSummary ?? "";
  if (!title || title.length > 160 || input.source.length === 0 || input.source.length > 50000
    || !diagramKinds.some((item) => item.value === input.kind) || !["active", "archived"].includes(status) || changeSummary.length > 500)
    throw new Error("mcp_diagram_invalid_input");
  let data: { id: string } | null = null;
  let error: unknown = null;
  if (input.diagramId) {
    const result = await access.user.rpc("update_project_diagram", {
      target_diagram_id: input.diagramId, diagram_title: title, diagram_kind: input.kind,
      diagram_source: input.source, diagram_status: status, revision_summary: changeSummary,
    });
    data = result.data ? { id: result.data } : null;
    error = result.error;
  } else {
    const result = await access.user.from("project_diagrams").insert({
      title, kind: input.kind, source: input.source, status, project_id: input.projectId,
      workspace_id: access.project.workspace_id, creator_id: userId,
    }).select("id").single();
    data = result.data;
    error = result.error;
  }
  if (error || !data) throw new Error("mcp_diagram_save_failed");
  scheduleDocumentAutomation(input.projectId, "diagram", data.id, userId);
  refreshProject(input.projectId, `/projects/${input.projectId}/documentation/diagrams/${data.id}`);
  return { id: data.id, projectId: input.projectId, title, kind: input.kind, status };
}

export async function restoreMcpDiagramVersion(userId: string, accessToken: string, input: {
  projectId: string; diagramId: string; versionId: string;
}) {
  const access = await editableProject(userId, input.projectId, accessToken);
  if (!access || !uuid.test(input.diagramId) || !uuid.test(input.versionId)) throw new Error("mcp_diagram_version_forbidden");
  const { data: version } = await createAdminClient().from("project_diagram_versions").select("id")
    .eq("id", input.versionId).eq("diagram_id", input.diagramId).eq("project_id", input.projectId).maybeSingle();
  if (!version) throw new Error("mcp_diagram_version_not_found");
  const { data, error } = await access.user.rpc("restore_project_diagram_version", { target_version_id: input.versionId });
  if (error || data !== input.diagramId) throw new Error("mcp_diagram_restore_failed");
  scheduleDocumentAutomation(input.projectId, "diagram", input.diagramId, userId);
  refreshProject(input.projectId, `/projects/${input.projectId}/documentation/diagrams/${input.diagramId}`);
  return { diagramId: input.diagramId, restoredVersionId: input.versionId };
}

export async function linkMcpDiagram(userId: string, accessToken: string, input: {
  projectId: string; diagramId: string; targetType: "requirement" | "decision"; targetId: string; linked: boolean;
}) {
  const access = await editableProject(userId, input.projectId, accessToken);
  if (!access || !uuid.test(input.diagramId) || !uuid.test(input.targetId)) throw new Error("mcp_diagram_link_forbidden");
  const admin = createAdminClient();
  const targetTable = input.targetType === "requirement" ? "requirements" : "architecture_decisions";
  const [{ data: diagram }, { data: target }] = await Promise.all([
    admin.from("project_diagrams").select("id").eq("id", input.diagramId).eq("project_id", input.projectId).maybeSingle(),
    admin.from(targetTable).select("id").eq("id", input.targetId).eq("project_id", input.projectId).maybeSingle(),
  ]);
  if (!diagram || !target) throw new Error("mcp_diagram_link_target_not_found");
  const db = createMcpSupabaseClient(accessToken);
  const table = input.targetType === "requirement" ? "diagram_requirements" : "diagram_decisions";
  const column = input.targetType === "requirement" ? "requirement_id" : "decision_id";
  const request = db.from(table);
  const result = input.linked
    ? await request.insert({ workspace_id: access.project.workspace_id, project_id: input.projectId, diagram_id: input.diagramId, [column]: input.targetId })
    : await request.delete().eq("diagram_id", input.diagramId).eq(column, input.targetId).eq("project_id", input.projectId);
  if (result.error) throw new Error("mcp_diagram_link_update_failed");
  refreshProject(input.projectId, `/projects/${input.projectId}/documentation/diagrams/${input.diagramId}`);
  return { diagramId: input.diagramId, targetId: input.targetId, targetType: input.targetType, linked: input.linked };
}
