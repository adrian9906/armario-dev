import "server-only";

import { decisionDocument, diagramDocument, requirementDocument, type PublishableDocument } from "@/lib/github/document-publication";
import { getGitHubAppConfig } from "@/lib/github/env";
import { commitFilesToGitHub } from "@/lib/github/git-data";
import { createGitHubIssue, updateGitHubIssue } from "@/lib/github/issues";
import { taskBranchName, taskIdFromGitHubBody, taskStatusFromIssue, webhookDedupeKey } from "@/lib/github/automation-rules";
import { createGitHubBranch, getGitHubProjectSnapshot } from "@/lib/github/repository-activity";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
type AutomationSettings = {
  task_issue_enabled: boolean;
  task_branch_enabled: boolean;
  task_pr_enabled: boolean;
  pr_merge_completes_task: boolean;
  issue_state_sync: boolean;
  document_publish_enabled: boolean;
  notifications_enabled: boolean;
  branch_prefix: string;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const defaultSettings: AutomationSettings = {
  task_issue_enabled: false,
  task_branch_enabled: false,
  task_pr_enabled: false,
  pr_merge_completes_task: false,
  issue_state_sync: false,
  document_publish_enabled: false,
  notifications_enabled: true,
  branch_prefix: "task",
};

async function contextForProject(projectId: string) {
  if (!uuid.test(projectId)) return null;
  const admin = createAdminClient();
  const [{ data: repository }, { data: settings }] = await Promise.all([
    admin.from("project_repositories")
      .select("project_id,workspace_id,repository_id,installation_id,owner_login,name,full_name,default_branch")
      .eq("project_id", projectId).maybeSingle(),
    admin.from("github_automation_settings").select("*").eq("project_id", projectId).maybeSingle(),
  ]);
  if (!repository) return null;
  const [{ data: installation }, config] = await Promise.all([
    admin.from("github_installations").select("installation_id,permissions,status")
      .eq("workspace_id", repository.workspace_id).eq("installation_id", repository.installation_id)
      .eq("status", "active").maybeSingle(),
    Promise.resolve(getGitHubAppConfig()),
  ]);
  if (!installation || !config) return null;
  return { admin, repository, installation, config, settings: (settings ?? defaultSettings) as AutomationSettings };
}

async function reserveEvent(input: {
  admin: Admin;
  projectId: string;
  workspaceId: string;
  taskId?: string | null;
  dedupeKey: string;
  origin: "armario" | "github";
  event: string;
  remoteId?: string | null;
  remoteVersion?: string | null;
  summary: string;
}) {
  const { data, error } = await input.admin.from("github_automation_events").insert({
    project_id: input.projectId,
    workspace_id: input.workspaceId,
    task_id: input.taskId ?? null,
    dedupe_key: input.dedupeKey,
    origin: input.origin,
    event: input.event,
    remote_id: input.remoteId ?? null,
    remote_version: input.remoteVersion ?? null,
    status: "running",
    summary: input.summary,
  }).select("id").maybeSingle();
  if (error?.code === "23505") return null;
  if (error || !data) throw new Error("github_automation_event_failed");
  return data.id as string;
}

async function finishEvent(admin: Admin, id: string, values: {
  status: "completed" | "failed" | "ignored";
  summary: string;
  details?: Record<string, unknown>;
  error?: string | null;
}) {
  await admin.from("github_automation_events").update({
    status: values.status,
    summary: values.summary.slice(0, 500),
    details: values.details ?? {},
    error: values.error?.slice(0, 2000) ?? null,
  }).eq("id", id);
}

const issueBody = (task: { id: string; description: string; priority: string; due_date: string | null }, projectId: string) => [
  task.description || "Tarea creada desde Armario Dev.",
  "",
  `**Prioridad:** ${task.priority}`,
  task.due_date ? `**Fecha límite:** ${task.due_date}` : null,
  "",
  `<!-- armario-dev-task:${task.id} -->`,
  `<!-- armario-dev-project:${projectId} -->`,
].filter(Boolean).join("\n");

export async function runTaskGitHubAutomation(input: {
  projectId: string;
  taskId: string;
  trigger: "created" | "updated" | "status_changed" | "manual";
}) {
  const context = await contextForProject(input.projectId);
  if (!context || (!context.settings.task_issue_enabled && !context.settings.task_branch_enabled)) return;
  const { data: task } = await context.admin.from("tasks")
    .select("id,title,description,status,priority,due_date,updated_at")
    .eq("id", input.taskId).eq("project_id", input.projectId).maybeSingle();
  if (!task) return;
  const eventId = await reserveEvent({
    admin: context.admin,
    projectId: input.projectId,
    workspaceId: context.repository.workspace_id,
    taskId: task.id,
    dedupeKey: `armario:task:${task.id}:${task.updated_at}:${input.trigger}`,
    origin: "armario",
    event: `task_${input.trigger}`,
    remoteVersion: task.updated_at,
    summary: `Procesando “${task.title}” en GitHub.`,
  });
  if (!eventId) return;

  try {
    const permissions = context.installation.permissions as Record<string, string>;
    const { data: currentLink } = await context.admin.from("github_task_links")
      .select("*").eq("task_id", task.id).maybeSingle();
    let link = currentLink;
    const changes: string[] = [];

    if (context.settings.task_issue_enabled) {
      if (permissions.issues !== "write") throw new Error("github_issues_permission");
      const desiredState = task.status === "done" || task.status === "archived" ? "closed" : "open";
      const stateReason = task.status === "archived" ? "not_planned" : desiredState === "closed" ? "completed" : "reopened";
      const issue = link?.issue_number
        ? await updateGitHubIssue({
          config: context.config,
          installationId: context.repository.installation_id,
          owner: context.repository.owner_login,
          repository: context.repository.name,
          number: Number(link.issue_number),
          title: task.title,
          body: issueBody(task, input.projectId),
          state: desiredState,
          stateReason,
        })
        : await createGitHubIssue({
          config: context.config,
          installationId: context.repository.installation_id,
          owner: context.repository.owner_login,
          repository: context.repository.name,
          title: task.title,
          body: issueBody(task, input.projectId),
        });
      const { data: savedLink, error } = await context.admin.from("github_task_links").upsert({
        project_id: input.projectId,
        workspace_id: context.repository.workspace_id,
        repository_id: context.repository.repository_id,
        task_id: task.id,
        issue_number: issue.number,
        issue_url: issue.html_url,
        issue_state: issue.state,
        remote_version: issue.updated_at,
        last_origin: "armario",
        last_event: link?.issue_number ? "issue_updated" : "issue_created",
      }, { onConflict: "task_id" }).select("*").single();
      if (error) throw error;
      link = savedLink;
      changes.push(link.issue_number ? `issue #${link.issue_number}` : "issue");
    }

    if (context.settings.task_branch_enabled && task.status === "in_progress" && !link?.branch_name) {
      if (permissions.contents !== "write") throw new Error("github_contents_permission");
      const branchName = taskBranchName(context.settings.branch_prefix, task.id, task.title);
      const branch = await createGitHubBranch(
        context.config,
        context.repository.installation_id,
        context.repository.owner_login,
        context.repository.name,
        branchName,
        context.repository.default_branch,
      );
      const { error } = await context.admin.from("github_task_links").upsert({
        project_id: input.projectId,
        workspace_id: context.repository.workspace_id,
        repository_id: context.repository.repository_id,
        task_id: task.id,
        branch_name: branchName,
        branch_head_sha: branch.object.sha,
        last_origin: "armario",
        last_event: "branch_created",
      }, { onConflict: "task_id" });
      if (error) throw error;
      changes.push(`rama ${branchName}`);
    }

    await finishEvent(context.admin, eventId, {
      status: changes.length ? "completed" : "ignored",
      summary: changes.length ? `Sincronizada “${task.title}”: ${changes.join(" y ")}.` : `“${task.title}” no necesitaba cambios en GitHub.`,
      details: { trigger: input.trigger, taskStatus: task.status, changes },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "github_automation_failed";
    await finishEvent(context.admin, eventId, {
      status: "failed",
      summary: `No se pudo sincronizar “${task.title}”.`,
      error: message,
    });
  }
}

async function loadDocument(admin: Admin, projectId: string, sourceType: "requirement" | "decision" | "diagram", sourceId: string) {
  if (sourceType === "requirement") {
    const { data } = await admin.from("requirements").select("id,title,description,acceptance_criteria,kind,priority,status,updated_at")
      .eq("project_id", projectId).eq("id", sourceId).maybeSingle();
    return data ? { document: requirementDocument(data), version: data.updated_at } : null;
  }
  if (sourceType === "decision") {
    const { data } = await admin.from("architecture_decisions").select("id,title,status,context,decision,consequences,decided_at,updated_at")
      .eq("project_id", projectId).eq("id", sourceId).maybeSingle();
    return data ? { document: decisionDocument(data), version: data.updated_at } : null;
  }
  const { data } = await admin.from("project_diagrams").select("id,title,kind,source,status,updated_at")
    .eq("project_id", projectId).eq("id", sourceId).maybeSingle();
  return data ? { document: diagramDocument(data), version: data.updated_at } : null;
}

export async function runDocumentGitHubAutomation(input: {
  projectId: string;
  sourceType: "requirement" | "decision" | "diagram";
  sourceId: string;
  actorId: string;
}) {
  const context = await contextForProject(input.projectId);
  if (!context?.settings.document_publish_enabled) return;
  const loaded = await loadDocument(context.admin, input.projectId, input.sourceType, input.sourceId) as { document: PublishableDocument; version: string } | null;
  if (!loaded) return;
  const { document, version } = loaded;
  const eventId = await reserveEvent({
    admin: context.admin,
    projectId: input.projectId,
    workspaceId: context.repository.workspace_id,
    dedupeKey: `armario:document:${input.sourceType}:${input.sourceId}:${version}`,
    origin: "armario",
    event: "document_published",
    remoteId: `${input.sourceType}:${input.sourceId}`,
    remoteVersion: version,
    summary: `Publicando “${document.title}” en GitHub.`,
  });
  if (!eventId) return;
  try {
    if ((context.installation.permissions as Record<string, string>).contents !== "write")
      throw new Error("github_contents_permission");
    const snapshot = await getGitHubProjectSnapshot(
      context.config,
      context.repository.installation_id,
      context.repository.owner_login,
      context.repository.name,
    );
    const head = snapshot.branches.find((branch) => branch.name === context.repository.default_branch)?.commit.sha;
    if (!head) throw new Error("github_default_branch_missing");
    const commit = await commitFilesToGitHub({
      config: context.config,
      installationId: context.repository.installation_id,
      owner: context.repository.owner_login,
      repository: context.repository.name,
      branch: context.repository.default_branch,
      expectedHeadSha: head,
      message: `docs: actualizar ${document.title}`.slice(0, 240),
      files: [{ path: document.path, content: document.content }],
    });
    await context.admin.from("github_publications").upsert({
      project_id: input.projectId,
      workspace_id: context.repository.workspace_id,
      repository_id: context.repository.repository_id,
      source_type: input.sourceType,
      source_id: input.sourceId,
      path: document.path,
      branch: context.repository.default_branch,
      last_commit_sha: commit.sha,
      published_by: input.actorId,
      published_at: new Date().toISOString(),
    }, { onConflict: "project_id,source_type,source_id" });
    await finishEvent(context.admin, eventId, {
      status: "completed",
      summary: `“${document.title}” fue publicado automáticamente.`,
      details: { path: document.path, commitSha: commit.sha, commitUrl: commit.html_url },
    });
  } catch (error) {
    await finishEvent(context.admin, eventId, {
      status: "failed",
      summary: `No se pudo publicar “${document.title}”.`,
      error: error instanceof Error ? error.message : "github_document_automation_failed",
    });
  }
}

async function notifyTaskPeople(admin: Admin, input: {
  workspaceId: string;
  projectId: string;
  taskId: string;
  title: string;
  body: string;
}) {
  const { data: task } = await admin.from("tasks").select("creator_id,assignee_id")
    .eq("id", input.taskId).eq("project_id", input.projectId).maybeSingle();
  if (!task) return;
  const recipients = [...new Set([task.creator_id, task.assignee_id].filter((value): value is string => Boolean(value)))];
  for (const recipient of recipients) {
    const { data: preference } = await admin.from("notification_preferences").select("github")
      .eq("workspace_id", input.workspaceId).eq("user_id", recipient).maybeSingle();
    if (preference?.github === false) continue;
    await admin.from("notifications").insert({
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      recipient_id: recipient,
      actor_id: null,
      type: "github",
      title: input.title.slice(0, 180),
      body: input.body.slice(0, 500),
      href: `/projects/${input.projectId}/tasks/${input.taskId}`,
    });
  }
}

type WebhookBody = Record<string, unknown>;

export async function processGitHubAutomationWebhook(input: {
  event: string;
  action: string | null;
  deliveryId: string;
  body: WebhookBody;
}) {
  const repository = input.body.repository as { id?: number } | undefined;
  if (!Number.isSafeInteger(repository?.id)) return { processed: false, reason: "repository_missing" };
  const admin = createAdminClient();
  const { data: linked } = await admin.from("project_repositories")
    .select("project_id,workspace_id,repository_id").eq("repository_id", repository!.id!).maybeSingle();
  if (!linked) return { processed: false, reason: "repository_not_linked" };
  const { data: settingsData } = await admin.from("github_automation_settings").select("*")
    .eq("project_id", linked.project_id).maybeSingle();
  const settings = (settingsData ?? defaultSettings) as AutomationSettings;
  const dedupeKey = webhookDedupeKey(input.deliveryId, input.event, input.action);

  if (input.event === "issues") {
    const issue = input.body.issue as { number?: number; state?: string; html_url?: string; updated_at?: string } | undefined;
    if (!Number.isSafeInteger(issue?.number)) return { processed: false, reason: "issue_missing" };
    const { data: link } = await admin.from("github_task_links").select("*")
      .eq("repository_id", linked.repository_id).eq("issue_number", issue!.number!).maybeSingle();
    if (!link) return { processed: false, reason: "task_link_missing" };
    const eventId = await reserveEvent({
      admin, projectId: linked.project_id, workspaceId: linked.workspace_id, taskId: link.task_id,
      dedupeKey, origin: "github", event: `issue_${input.action ?? "updated"}`,
      remoteId: String(issue!.number), remoteVersion: issue?.updated_at,
      summary: `Procesando el issue #${issue!.number}.`,
    });
    if (!eventId) return { processed: false, reason: "duplicate" };
    const isStateChange = input.action === "closed" || input.action === "reopened";
    if (settings.issue_state_sync && isStateChange) {
      const nextStatus = taskStatusFromIssue(input.action ?? "", Boolean(link.branch_name));
      if (!nextStatus) {
        await finishEvent(admin, eventId, { status: "ignored", summary: `El evento del issue #${issue!.number} no cambió su estado.` });
        return { processed: true };
      }
      const { data: task } = await admin.from("tasks").select("title,status").eq("id", link.task_id).maybeSingle();
      if (task && task.status !== nextStatus) await admin.from("tasks").update({ status: nextStatus }).eq("id", link.task_id);
      await admin.from("github_task_links").update({
        issue_state: issue?.state === "closed" ? "closed" : "open",
        issue_url: issue?.html_url ?? link.issue_url,
        remote_version: issue?.updated_at ?? null,
        last_origin: "github",
        last_event: `issue_${input.action}`,
      }).eq("id", link.id);
      await finishEvent(admin, eventId, {
        status: "completed",
        summary: `Issue #${issue!.number} ${input.action === "closed" ? "cerrado" : "reabierto"}; tarea movida a ${nextStatus}.`,
        details: { taskStatus: nextStatus, issueNumber: issue!.number },
      });
      if (settings.notifications_enabled) await notifyTaskPeople(admin, {
        workspaceId: linked.workspace_id, projectId: linked.project_id, taskId: link.task_id,
        title: `GitHub actualizó “${task?.title ?? "una tarea"}”`,
        body: `El issue #${issue!.number} fue ${input.action === "closed" ? "cerrado" : "reabierto"} y la tarea se sincronizó.`,
      });
      return { processed: true };
    }
    await finishEvent(admin, eventId, { status: "ignored", summary: `El evento del issue #${issue!.number} no requería sincronización.` });
    return { processed: true };
  }

  if (input.event === "pull_request") {
    const pullRequest = input.body.pull_request as {
      number?: number; state?: string; merged?: boolean; html_url?: string; updated_at?: string;
      body?: string | null; head?: { ref?: string; sha?: string };
    } | undefined;
    const number = pullRequest?.number ?? (input.body.number as number | undefined);
    if (!Number.isSafeInteger(number)) return { processed: false, reason: "pull_request_missing" };
    let { data: link } = await admin.from("github_task_links").select("*")
      .eq("repository_id", linked.repository_id).eq("pull_request_number", number!).maybeSingle();
    if (!link) {
      const taskId = taskIdFromGitHubBody(pullRequest?.body);
      if (taskId) {
        const { data: candidate } = await admin.from("github_task_links").select("*")
          .eq("project_id", linked.project_id).eq("task_id", taskId).maybeSingle();
        link = candidate;
      }
    }
    if (!link) return { processed: false, reason: "task_link_missing" };
    const eventId = await reserveEvent({
      admin, projectId: linked.project_id, workspaceId: linked.workspace_id, taskId: link.task_id,
      dedupeKey, origin: "github", event: `pull_request_${input.action ?? "updated"}`,
      remoteId: String(number), remoteVersion: pullRequest?.updated_at,
      summary: `Procesando el pull request #${number}.`,
    });
    if (!eventId) return { processed: false, reason: "duplicate" };
    const merged = Boolean(pullRequest?.merged);
    const prState = merged ? "merged" : pullRequest?.state === "closed" ? "closed" : "open";
    await admin.from("github_task_links").update({
      pull_request_number: number,
      pull_request_url: pullRequest?.html_url ?? link.pull_request_url,
      pull_request_state: prState,
      branch_head_sha: pullRequest?.head?.sha ?? link.branch_head_sha,
      remote_version: pullRequest?.updated_at ?? null,
      last_origin: "github",
      last_event: `pull_request_${input.action ?? "updated"}`,
    }).eq("id", link.id);
    if (merged && settings.pr_merge_completes_task) {
      const { data: task } = await admin.from("tasks").select("title,status").eq("id", link.task_id).maybeSingle();
      if (task && task.status !== "done") await admin.from("tasks").update({ status: "done" }).eq("id", link.task_id);
      await finishEvent(admin, eventId, {
        status: "completed",
        summary: `PR #${number} fusionado; la tarea quedó terminada.`,
        details: { pullRequestNumber: number, taskStatus: "done" },
      });
      if (settings.notifications_enabled) await notifyTaskPeople(admin, {
        workspaceId: linked.workspace_id, projectId: linked.project_id, taskId: link.task_id,
        title: `PR fusionado para “${task?.title ?? "una tarea"}”`,
        body: `El pull request #${number} fue fusionado y la tarea quedó terminada.`,
      });
    } else {
      await finishEvent(admin, eventId, {
        status: "completed",
        summary: `Pull request #${number} sincronizado como ${prState}.`,
        details: { pullRequestNumber: number, state: prState },
      });
    }
    return { processed: true };
  }

  if (input.event === "push") {
    const ref = typeof input.body.ref === "string" ? input.body.ref : "";
    const branch = ref.startsWith("refs/heads/") ? ref.slice(11) : "";
    const after = typeof input.body.after === "string" && /^[0-9a-f]{40}$/i.test(input.body.after) ? input.body.after : null;
    if (!branch || !after) return { processed: false, reason: "branch_missing" };
    const { data: link } = await admin.from("github_task_links").select("*")
      .eq("repository_id", linked.repository_id).eq("branch_name", branch).maybeSingle();
    if (!link) return { processed: false, reason: "task_link_missing" };
    const eventId = await reserveEvent({
      admin, projectId: linked.project_id, workspaceId: linked.workspace_id, taskId: link.task_id,
      dedupeKey, origin: "github", event: "branch_pushed", remoteId: after,
      summary: `Nuevos commits en ${branch}.`,
    });
    if (!eventId) return { processed: false, reason: "duplicate" };
    await admin.from("github_task_links").update({
      branch_head_sha: after, last_origin: "github", last_event: "branch_pushed",
    }).eq("id", link.id);
    await finishEvent(admin, eventId, {
      status: "completed", summary: `Commits de ${branch} vinculados a la tarea.`,
      details: { branch, headSha: after },
    });
    return { processed: true };
  }

  return { processed: false, reason: "event_not_supported" };
}
