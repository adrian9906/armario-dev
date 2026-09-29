"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createGitHubPullRequest } from "@/lib/github/pull-requests";
import { runTaskGitHubAutomation } from "@/lib/github/automation";
import { getLinkedGitHubProject } from "@/lib/github/project-context";

export type GitHubAutomationFormState = { error: string | null; success: string | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const branchPrefix = /^[a-z0-9][a-z0-9._/-]{0,39}$/;
const read = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

async function managerContext(projectId: string) {
  const { userId } = await auth();
  if (!userId || !uuid.test(projectId)) return null;
  const context = await getLinkedGitHubProject(projectId, userId);
  return context?.access.canManage ? context : null;
}

const enabled = (form: FormData, name: string) => form.get(name) === "on";

export async function saveGitHubAutomationSettings(
  _state: GitHubAutomationFormState,
  form: FormData,
): Promise<GitHubAutomationFormState> {
  const projectId = read(form, "project_id");
  const prefix = read(form, "branch_prefix").toLowerCase();
  if (!branchPrefix.test(prefix) || prefix.includes("..") || prefix.endsWith("/"))
    return { error: "Usa un prefijo de rama válido, por ejemplo task o feature/task.", success: null };
  const context = await managerContext(projectId);
  if (!context) return { error: "No tienes permiso para configurar estas automatizaciones.", success: null };

  const { error } = await context.admin.from("github_automation_settings").upsert({
    project_id: projectId,
    workspace_id: context.access.project.workspace_id,
    task_issue_enabled: enabled(form, "task_issue_enabled"),
    task_branch_enabled: enabled(form, "task_branch_enabled"),
    task_pr_enabled: enabled(form, "task_pr_enabled"),
    pr_merge_completes_task: enabled(form, "pr_merge_completes_task"),
    issue_state_sync: enabled(form, "issue_state_sync"),
    document_publish_enabled: enabled(form, "document_publish_enabled"),
    notifications_enabled: enabled(form, "notifications_enabled"),
    branch_prefix: prefix,
    created_by: context.userId,
  }, { onConflict: "project_id" });
  if (error) return { error: "No se pudo guardar la configuración de automatizaciones.", success: null };
  revalidatePath(`/projects/${projectId}`);
  return { error: null, success: "Automatizaciones guardadas." };
}

export async function synchronizeGitHubTasks(
  _state: GitHubAutomationFormState,
  form: FormData,
): Promise<GitHubAutomationFormState> {
  const projectId = read(form, "project_id");
  const context = await managerContext(projectId);
  if (!context) return { error: "No tienes permiso para ejecutar las automatizaciones.", success: null };
  const { data: tasks, error } = await context.admin.from("tasks").select("id")
    .eq("project_id", projectId).neq("status", "archived").order("position").limit(100);
  if (error) return { error: "No se pudieron cargar las tareas.", success: null };
  for (const task of tasks ?? []) {
    await runTaskGitHubAutomation({ projectId, taskId: task.id, trigger: "manual" });
  }
  revalidatePath(`/projects/${projectId}`);
  return { error: null, success: `${tasks?.length ?? 0} tareas fueron revisadas.` };
}

export async function createTaskGitHubPullRequest(
  _state: GitHubAutomationFormState,
  form: FormData,
): Promise<GitHubAutomationFormState> {
  const projectId = read(form, "project_id");
  const taskId = read(form, "task_id");
  if (!uuid.test(taskId)) return { error: "La tarea no es válida.", success: null };
  const context = await managerContext(projectId);
  if (!context) return { error: "No tienes permiso para crear este pull request.", success: null };
  const permissions = context.installation.permissions as Record<string, string>;
  if (permissions.pull_requests !== "write")
    return { error: "Activa Pull requests: Read and write en la GitHub App.", success: null };
  const [{ data: settings }, { data: task }, { data: link }] = await Promise.all([
    context.admin.from("github_automation_settings").select("task_pr_enabled").eq("project_id", projectId).maybeSingle(),
    context.admin.from("tasks").select("id,title,description,status").eq("project_id", projectId).eq("id", taskId).maybeSingle(),
    context.admin.from("github_task_links").select("*").eq("project_id", projectId).eq("task_id", taskId).maybeSingle(),
  ]);
  if (!settings?.task_pr_enabled) return { error: "Activa primero la automatización de pull requests.", success: null };
  if (!task || !link?.branch_name) return { error: "Pon la tarea en curso y sincronízala para crear su rama.", success: null };
  if (link.pull_request_number && link.pull_request_state === "open")
    return { error: `La tarea ya tiene el pull request #${link.pull_request_number}.`, success: null };

  try {
    const pullRequest = await createGitHubPullRequest({
      config: context.config,
      installationId: context.installation.installation_id,
      owner: context.repository.owner_login,
      repository: context.repository.name,
      title: task.title,
      body: [
        task.description || "Trabajo preparado desde Armario Dev.",
        "",
        link.issue_number ? `Closes #${link.issue_number}` : null,
        `<!-- armario-dev-task:${task.id} -->`,
        `<!-- armario-dev-project:${projectId} -->`,
      ].filter(Boolean).join("\n"),
      head: link.branch_name,
      base: context.repository.default_branch,
      draft: form.get("draft") === "on",
    });
    const { error } = await context.admin.from("github_task_links").update({
      pull_request_number: pullRequest.number,
      pull_request_url: pullRequest.html_url,
      pull_request_state: "open",
      branch_head_sha: pullRequest.head.sha,
      remote_version: pullRequest.updated_at,
      last_origin: "armario",
      last_event: "pull_request_created",
    }).eq("id", link.id);
    if (error) throw error;
    await context.admin.from("github_automation_events").insert({
      project_id: projectId,
      workspace_id: context.access.project.workspace_id,
      task_id: task.id,
      dedupe_key: `armario:task:${task.id}:pr:${pullRequest.number}`,
      origin: "armario",
      event: "pull_request_created",
      remote_id: String(pullRequest.number),
      remote_version: pullRequest.updated_at,
      status: "completed",
      summary: `PR #${pullRequest.number} creado para “${task.title}”.`,
      details: { pullRequestUrl: pullRequest.html_url, draft: pullRequest.draft },
    });
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: `Pull request #${pullRequest.number} creado.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "github_api_422")
      return { error: "La rama aún no tiene commits nuevos o GitHub rechazó el pull request.", success: null };
    return { error: "No se pudo crear el pull request de la tarea.", success: null };
  }
}
