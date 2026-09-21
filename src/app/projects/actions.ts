"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validTaskDates } from "@/lib/task-dates";
import { moduleOptions, projectKinds, projectStages, requirementKinds, requirementPriorities, taskPriorities, taskStatuses } from "@/lib/project-model";
import { getProjectAccess } from "@/lib/project-access";

export type FormState = { error: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const read = (form: FormData, name: string) => { const item = form.get(name); return typeof item === "string" ? item.trim() : ""; };
const inOptions = (value: string, choices: readonly { value: string }[]) => choices.some((choice) => choice.value === value);
const projectUrl = (id: string, view = "overview") => `/projects/${id}?view=${view}`;
const taskUrl = (projectId: string, taskId: string) => `/projects/${projectId}/tasks/${taskId}`;
const requirementUrl = (projectId: string, requirementId: string) => `/projects/${projectId}/requirements/${requirementId}`;

async function actor() {
  const { userId } = await auth();
  if (!userId) throw new Error("Debes iniciar sesión.");
  return userId;
}

async function editableProject(projectId: string, userId: string) {
  if (!uuid.test(projectId)) return null;
  const access = await getProjectAccess(projectId, userId);
  return access?.canEdit ? access.project : null;
}

async function commentableProject(projectId: string, userId: string) {
  if (!uuid.test(projectId)) return null;
  const access = await getProjectAccess(projectId, userId);
  return access?.canComment ? access.project : null;
}

async function workableTask(projectId: string, taskId: string, userId: string) {
  if (!uuid.test(projectId) || !uuid.test(taskId)) return null;
  const access = await getProjectAccess(projectId, userId);
  if (!access) return null;
  const { data: task } = await access.db.from("tasks").select("id,assignee_id")
    .eq("id", taskId).eq("project_id", projectId).maybeSingle();
  return task && (access.canEdit || (access.role === "contributor" && task.assignee_id === userId))
    ? access.project : null;
}

function modulesFrom(form: FormData) {
  const selected = form.getAll("modules").filter((item): item is string => typeof item === "string");
  if (selected.some((item) => !moduleOptions.some((option) => option.value === item))) return null;
  return Object.fromEntries(moduleOptions.map((option) => [option.value, selected.includes(option.value)]));
}

export async function convertIdea(_state: FormState, form: FormData): Promise<FormState> {
  const userId = await actor();
  const ideaId = read(form, "idea_id");
  const kind = read(form, "kind");
  const modules = modulesFrom(form);
  if (!uuid.test(ideaId) || !inOptions(kind, projectKinds) || !modules)
    return { error: "Revisa el tipo y los módulos elegidos." };
  const db = createClient();
  const { data: idea } = await db.from("ideas").select("workspace_id").eq("id", ideaId).maybeSingle();
  if (!idea) return { error: "La idea ya no está disponible." };
  const { data: membership } = await db.from("workspace_memberships").select("role")
    .eq("workspace_id", idea.workspace_id).eq("user_id", userId).maybeSingle();
  if (!membership || !["owner", "admin", "editor"].includes(membership.role))
    return { error: "No tienes permiso para convertir esta idea." };
  const { data: projectId, error } = await db.rpc("convert_idea_to_project", {
    target_idea_id: ideaId, target_kind: kind, selected_modules: modules,
  });
  if (error || !projectId) return { error: "No se pudo convertir la idea. Actualiza la página e inténtalo otra vez." };
  revalidatePath("/dashboard");
  revalidatePath(`/ideas/${ideaId}`);
  redirect(projectUrl(projectId));
}

export async function updateProject(_state: FormState, form: FormData): Promise<FormState> {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const project = await editableProject(projectId, userId);
  if (!project) return { error: "No tienes permiso para editar este proyecto." };
  const title = read(form, "title");
  const objective = read(form, "objective");
  const kind = read(form, "kind");
  const stage = read(form, "stage");
  const modules = modulesFrom(form);
  if (!title || title.length > 160 || objective.length > 10000 || !inOptions(kind, projectKinds)
    || !inOptions(stage, projectStages) || !modules) return { error: "Revisa el título, objetivo, tipo, etapa y módulos." };
  const { data, error } = await createClient().from("projects")
    .update({ title, objective, kind, stage, modules }).eq("id", projectId).eq("workspace_id", project.workspace_id)
    .select("id").maybeSingle();
  if (error || !data) return { error: "No se pudieron guardar los cambios." };
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  redirect(projectUrl(projectId));
}

function taskFields(form: FormData) {
  const title = read(form, "title");
  const description = read(form, "description");
  const status = read(form, "status") || "todo";
  const priority = read(form, "priority") || "medium";
  const selectedAssignee = read(form, "assignee_id");
  const assigneeId = selectedAssignee && selectedAssignee !== "unassigned" ? selectedAssignee : null;
  const startDate = read(form, "start_date") || null;
  const dueDate = read(form, "due_date") || null;
  if (!title || title.length > 160 || description.length > 10000 || !inOptions(status, taskStatuses)
    || !inOptions(priority, taskPriorities) || !validTaskDates(startDate, dueDate)) return null;
  return { title, description, status, priority, assignee_id: assigneeId, start_date: startDate, due_date: dueDate };
}

async function validAssignee(workspaceId: string, assigneeId: string | null) {
  if (!assigneeId) return true;
  const { data } = await createClient().from("workspace_memberships").select("user_id")
    .eq("workspace_id", workspaceId).eq("user_id", assigneeId).maybeSingle();
  return !!data;
}

export async function createTask(_state: FormState, form: FormData): Promise<FormState> {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const project = await editableProject(projectId, userId);
  const fields = taskFields(form);
  const checklist = read(form, "checklist").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (!project) return { error: "No tienes permiso para crear tareas." };
  if (!fields) return { error: "Revisa el título, estado, prioridad y rango de fechas." };
  if (checklist.length > 30 || checklist.some((item) => item.length > 300))
    return { error: "El checklist admite hasta 30 pasos de 300 caracteres cada uno." };
  if (!(await validAssignee(project.workspace_id, fields.assignee_id))) return { error: "Asigna la tarea a un miembro de este espacio." };
  const { data, error } = await createClient().rpc("create_task_with_checklist", {
    target_project_id: projectId,
    task_title: fields.title,
    task_description: fields.description,
    task_status: fields.status,
    task_priority: fields.priority,
    target_assignee_id: fields.assignee_id,
    target_start_date: fields.start_date,
    target_due_date: fields.due_date,
    checklist_contents: checklist,
  });
  if (error || !data) return { error: "No se pudo crear la tarea." };
  revalidatePath(`/projects/${projectId}`);
  redirect(taskUrl(projectId, data));
}

export async function updateTask(_state: FormState, form: FormData): Promise<FormState> {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const taskId = read(form, "task_id");
  const project = await editableProject(projectId, userId);
  const fields = taskFields(form);
  if (!project || !uuid.test(taskId)) return { error: "No tienes permiso para editar esta tarea." };
  if (!fields) return { error: "Revisa el título, estado, prioridad y rango de fechas." };
  if (!(await validAssignee(project.workspace_id, fields.assignee_id))) return { error: "Asigna la tarea a un miembro de este espacio." };
  const { data, error } = await createClient().from("tasks").update(fields)
    .eq("id", taskId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
    .select("id").maybeSingle();
  if (error || !data) return { error: "No se pudo guardar la tarea." };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(taskUrl(projectId, taskId));
  redirect(taskUrl(projectId, taskId));
}

export async function setTaskStatus(form: FormData) {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const taskId = read(form, "task_id");
  const status = read(form, "status");
  const project = await workableTask(projectId, taskId, userId);
  if (!project || !uuid.test(taskId) || ![...taskStatuses.map((item) => item.value), "archived"].includes(status))
    throw new Error("No tienes permiso para cambiar esta tarea.");
  const { data, error } = await createClient().from("tasks").update({ status })
    .eq("id", taskId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
    .select("id").maybeSingle();
  if (error || !data) throw new Error("No se pudo cambiar el estado de la tarea.");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(taskUrl(projectId, taskId));
  redirect(read(form, "return_to") === "board" ? projectUrl(projectId, "board") : taskUrl(projectId, taskId));
}

export async function moveTask(form: FormData) {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const taskId = read(form, "task_id");
  const direction = read(form, "direction");
  if (!await editableProject(projectId, userId) || !uuid.test(taskId) || !["up", "down"].includes(direction))
    throw new Error("No tienes permiso para ordenar esta tarea.");
  const db = createClient();
  const { data: task } = await db.from("tasks").select("id").eq("id", taskId).eq("project_id", projectId).maybeSingle();
  if (!task) throw new Error("Tarea no encontrada.");
  const { error } = await db.rpc("move_project_task", { target_task_id: taskId, direction });
  if (error) throw new Error("No se pudo ordenar la tarea.");
  revalidatePath(`/projects/${projectId}`);
  redirect(projectUrl(projectId, "tasks"));
}

function requirementFields(form: FormData) {
  const title = read(form, "title");
  const description = read(form, "description");
  const acceptanceCriteria = read(form, "acceptance_criteria");
  const kind = read(form, "kind") || "functional";
  const priority = read(form, "priority") || "must";
  if (!title || title.length > 160 || description.length > 10000 || acceptanceCriteria.length > 10000
    || !inOptions(kind, requirementKinds) || !inOptions(priority, requirementPriorities)) return null;
  return { title, description, acceptance_criteria: acceptanceCriteria, kind, priority };
}

export async function createRequirement(_state: FormState, form: FormData): Promise<FormState> {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const project = await editableProject(projectId, userId);
  const fields = requirementFields(form);
  if (!project) return { error: "No tienes permiso para crear requisitos." };
  if (!fields) return { error: "Revisa el título, los criterios y la prioridad." };
  const { data, error } = await createClient().from("requirements")
    .insert({ ...fields, project_id: projectId, workspace_id: project.workspace_id, creator_id: userId })
    .select("id").single();
  if (error || !data) return { error: "No se pudo crear el requisito." };
  revalidatePath(`/projects/${projectId}`);
  redirect(requirementUrl(projectId, data.id));
}

export async function updateRequirement(_state: FormState, form: FormData): Promise<FormState> {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const requirementId = read(form, "requirement_id");
  const project = await editableProject(projectId, userId);
  const fields = requirementFields(form);
  if (!project || !uuid.test(requirementId)) return { error: "No tienes permiso para editar este requisito." };
  if (!fields) return { error: "Revisa el título, los criterios y la prioridad." };
  const { data, error } = await createClient().from("requirements").update(fields)
    .eq("id", requirementId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
    .select("id").maybeSingle();
  if (error || !data) return { error: "No se pudo guardar el requisito." };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(requirementUrl(projectId, requirementId));
  redirect(requirementUrl(projectId, requirementId));
}

export async function setRequirementArchived(form: FormData) {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const requirementId = read(form, "requirement_id");
  const status = read(form, "status");
  const project = await editableProject(projectId, userId);
  if (!project || !uuid.test(requirementId) || !["active", "archived"].includes(status))
    throw new Error("No tienes permiso para cambiar este requisito.");
  const { data, error } = await createClient().from("requirements").update({ status })
    .eq("id", requirementId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
    .select("id").maybeSingle();
  if (error || !data) throw new Error("No se pudo cambiar el requisito.");
  revalidatePath(`/projects/${projectId}`);
  redirect(requirementUrl(projectId, requirementId));
}

export async function moveRequirement(form: FormData) {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const requirementId = read(form, "requirement_id");
  const direction = read(form, "direction");
  if (!await editableProject(projectId, userId) || !uuid.test(requirementId) || !["up", "down"].includes(direction))
    throw new Error("No tienes permiso para ordenar este requisito.");
  const db = createClient();
  const { data: requirement } = await db.from("requirements").select("id")
    .eq("id", requirementId).eq("project_id", projectId).maybeSingle();
  if (!requirement) throw new Error("Requisito no encontrado.");
  const { error } = await db.rpc("move_project_requirement", { target_requirement_id: requirementId, direction });
  if (error) throw new Error("No se pudo ordenar el requisito.");
  revalidatePath(`/projects/${projectId}`);
  redirect(projectUrl(projectId, "requirements"));
}

export async function addChecklistItem(_state: FormState, form: FormData): Promise<FormState> {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const taskId = read(form, "task_id");
  const content = read(form, "content");
  const project = await workableTask(projectId, taskId, userId);
  if (!project || !uuid.test(taskId)) return { error: "No tienes permiso para esta tarea." };
  if (!content || content.length > 300) return { error: "Escribe un paso de hasta 300 caracteres." };
  const db = createClient();
  const { data: task } = await db.from("tasks").select("id").eq("id", taskId).eq("project_id", projectId).maybeSingle();
  if (!task) return { error: "Tarea no encontrada." };
  const { data: last } = await db.from("checklist_items").select("position").eq("task_id", taskId)
    .order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await db.from("checklist_items")
    .insert({ workspace_id: project.workspace_id, project_id: projectId, task_id: taskId, content, position: (last?.position ?? 0) + 1 });
  if (error) return { error: "No se pudo añadir el paso." };
  revalidatePath(taskUrl(projectId, taskId));
  redirect(taskUrl(projectId, taskId));
}

export async function toggleChecklistItem(form: FormData) {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const taskId = read(form, "task_id");
  const itemId = read(form, "item_id");
  const project = await workableTask(projectId, taskId, userId);
  if (!project || !uuid.test(taskId) || !uuid.test(itemId)) throw new Error("No tienes permiso para este paso.");
  const db = createClient();
  const { data: item } = await db.from("checklist_items").select("id,completed_at")
    .eq("id", itemId).eq("task_id", taskId).eq("project_id", projectId).maybeSingle();
  if (!item) throw new Error("Paso no encontrado.");
  const { data, error } = await db.from("checklist_items")
    .update({ completed_at: item.completed_at ? null : new Date().toISOString() })
    .eq("id", itemId).eq("task_id", taskId).eq("project_id", projectId).select("id").maybeSingle();
  if (error || !data) throw new Error("No se pudo actualizar el paso.");
  revalidatePath(taskUrl(projectId, taskId));
}

export async function toggleRequirementLink(form: FormData) {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const taskId = read(form, "task_id");
  const requirementId = read(form, "requirement_id");
  const operation = read(form, "operation");
  const project = await editableProject(projectId, userId);
  if (!project || !uuid.test(taskId) || !uuid.test(requirementId) || !["add", "remove"].includes(operation))
    throw new Error("No tienes permiso para este vínculo.");
  const db = createClient();
  const [{ data: task }, { data: requirement }] = await Promise.all([
    db.from("tasks").select("id").eq("id", taskId).eq("project_id", projectId).maybeSingle(),
    db.from("requirements").select("id").eq("id", requirementId).eq("project_id", projectId).maybeSingle(),
  ]);
  if (!task || !requirement) throw new Error("La tarea y el requisito deben pertenecer al mismo proyecto.");
  const query = db.from("task_requirements");
  const result = operation === "add"
    ? await query.insert({ workspace_id: project.workspace_id, project_id: projectId, task_id: taskId, requirement_id: requirementId })
    : await query.delete().eq("task_id", taskId).eq("requirement_id", requirementId)
      .eq("project_id", projectId).eq("workspace_id", project.workspace_id);
  if (result.error) throw new Error("No se pudo cambiar el vínculo.");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(taskUrl(projectId, taskId));
  revalidatePath(requirementUrl(projectId, requirementId));
  redirect(taskUrl(projectId, taskId));
}

export async function addComment(_state: FormState, form: FormData): Promise<FormState> {
  const userId = await actor();
  const projectId = read(form, "project_id");
  const targetId = read(form, "target_id");
  const targetType = read(form, "target_type");
  const content = read(form, "content");
  const project = await commentableProject(projectId, userId);
  if (!project || !uuid.test(targetId) || !["task", "requirement"].includes(targetType))
    return { error: "No tienes permiso para comentar aquí." };
  if (!content || content.length > 5000) return { error: "Escribe un comentario de hasta 5000 caracteres." };
  const table = targetType === "task" ? "tasks" : "requirements";
  const { data: target } = await createClient().from(table).select("id")
    .eq("id", targetId).eq("project_id", projectId).maybeSingle();
  if (!target) return { error: "El elemento ya no está disponible." };
  const { error } = await createClient().from("project_comments").insert({
    workspace_id: project.workspace_id, project_id: projectId, author_id: userId, content,
    task_id: targetType === "task" ? targetId : null,
    requirement_id: targetType === "requirement" ? targetId : null,
  });
  if (error) return { error: "No se pudo guardar el comentario." };
  const path = targetType === "task" ? taskUrl(projectId, targetId) : requirementUrl(projectId, targetId);
  revalidatePath(path);
  redirect(path);
}
