"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getGitHubAppConfig } from "@/lib/github/env";
import { isValidGitBranchName } from "@/lib/github/branch-name";
import { decisionDocument, diagramDocument, requirementDocument, type PublishableDocument } from "@/lib/github/document-publication";
import { commitFilesToGitHub } from "@/lib/github/git-data";
import { synchronizeRepositoryWithRunner } from "@/lib/github/git-runner";
import { getLinkedGitHubProject } from "@/lib/github/project-context";
import {
  createGitHubBranch as createGitHubBranchRemote,
  deleteGitHubBranch as deleteGitHubBranchRemote,
} from "@/lib/github/repository-activity";
import {
  createGitHubRepository,
  getGitHubInstallationRepository,
  repositoryRecord,
} from "@/lib/github/repositories";
import { getProjectAccess } from "@/lib/project-access";
import { createAdminClient } from "@/lib/supabase/admin";

export type GitHubRepositoryFormState = { error: string | null; success: string | null; commitUrl?: string | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const repositoryName = /^[A-Za-z0-9._-]{1,100}$/;
const gitignoreTemplates = new Set(["Node", "Python", "Java", "VisualStudio", "Go", "Rust"]);
const licenseTemplates = new Set(["mit", "apache-2.0", "gpl-3.0", "mpl-2.0"]);
const read = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

async function managerContext(projectId: string) {
  const { userId } = await auth();
  if (!userId || !uuid.test(projectId)) return null;
  const access = await getProjectAccess(projectId, userId);
  if (!access?.canManage) return null;

  const admin = createAdminClient();
  const { data: installation } = await admin.from("github_installations")
    .select("installation_id,account_login,account_type,permissions,status")
    .eq("workspace_id", access.project.workspace_id)
    .eq("status", "active")
    .maybeSingle();
  const config = getGitHubAppConfig();
  if (!installation || !config) return null;

  return { access, admin, config, installation, userId };
}

function friendlyGitHubError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "github_api_401") return "GitHub rechazó la autenticación. Vuelve a conectar la App.";
  if (message === "github_api_403") return "La GitHub App no tiene permiso para realizar esta operación.";
  if (message === "github_api_404") return "El repositorio ya no está disponible para esta instalación.";
  if (message === "github_api_422") return "GitHub rechazó los datos. Comprueba que el nombre no esté ocupado.";
  if (message === "github_default_branch") return "La rama principal no se puede eliminar.";
  if (message === "github_protected_branch") return "La rama está protegida en GitHub y no se puede eliminar.";
  if (message === "github_branch_moved") return "La rama cambió mientras preparábamos el commit. Actualiza y vuelve a intentarlo.";
  if (message === "github_commit_file_count") return "Selecciona entre 1 y 100 documentos por commit.";
  if (message === "github_commit_invalid_file") return "Uno de los documentos supera el límite o genera una ruta no válida.";
  if (message.includes("not a git command") || message.includes("ENOENT")) return "Git no está disponible en este servidor.";
  if (message.startsWith("git_runner_")) return "La sincronización Git no pudo completarse. Revisa la rama y vuelve a intentarlo.";
  if (message.startsWith("github_dns_") || message === "github_api_timeout")
    return "No se pudo comunicar con GitHub. Inténtalo de nuevo.";
  return "No se pudo completar la operación con GitHub.";
}

async function createSyncJob(
  context: NonNullable<Awaited<ReturnType<typeof linkedManagerContext>>>,
  projectId: string,
  operation: string,
  payload: Record<string, unknown>,
) {
  const { data, error } = await context.admin.from("github_sync_jobs").insert({
    workspace_id: context.access.project.workspace_id,
    project_id: projectId,
    operation,
    payload,
    status: "pending",
    created_by: context.userId,
  }).select("id").single();
  if (error || !data) throw new Error("github_job_create_failed");
  await context.admin.from("github_sync_jobs").update({
    status: "running",
    attempt_count: 1,
    started_at: new Date().toISOString(),
  }).eq("id", data.id);
  return data.id as string;
}

async function finishSyncJob(
  context: NonNullable<Awaited<ReturnType<typeof linkedManagerContext>>>,
  jobId: string,
  status: "completed" | "failed",
  payload: Record<string, unknown>,
  error?: string,
) {
  await context.admin.from("github_sync_jobs").update({
    status,
    payload,
    error: error?.slice(0, 2000) ?? null,
    finished_at: new Date().toISOString(),
  }).eq("id", jobId);
}

async function loadPublishableDocuments(
  context: NonNullable<Awaited<ReturnType<typeof linkedManagerContext>>>,
  projectId: string,
  references: string[],
) {
  const grouped = { requirement: [] as string[], decision: [] as string[], diagram: [] as string[] };
  for (const reference of references) {
    const [type, id, extra] = reference.split(":");
    if (extra || !uuid.test(id) || !Object.hasOwn(grouped, type)) throw new Error("github_invalid_document");
    grouped[type as keyof typeof grouped].push(id);
  }
  const [requirements, decisions, diagrams] = await Promise.all([
    grouped.requirement.length ? context.admin.from("requirements").select("id,title,description,acceptance_criteria,kind,priority,status").eq("project_id", projectId).in("id", grouped.requirement) : Promise.resolve({ data: [], error: null }),
    grouped.decision.length ? context.admin.from("architecture_decisions").select("id,title,status,context,decision,consequences,decided_at").eq("project_id", projectId).in("id", grouped.decision) : Promise.resolve({ data: [], error: null }),
    grouped.diagram.length ? context.admin.from("project_diagrams").select("id,title,kind,source,status").eq("project_id", projectId).in("id", grouped.diagram) : Promise.resolve({ data: [], error: null }),
  ]);
  if (requirements.error || decisions.error || diagrams.error) throw new Error("github_documents_load_failed");
  const documents: PublishableDocument[] = [
    ...(requirements.data ?? []).map(requirementDocument),
    ...(decisions.data ?? []).map(decisionDocument),
    ...(diagrams.data ?? []).map(diagramDocument),
  ];
  if (documents.length !== references.length) throw new Error("github_invalid_document");
  return documents;
}

async function linkedManagerContext(projectId: string) {
  const { userId } = await auth();
  if (!userId) return null;
  const context = await getLinkedGitHubProject(projectId, userId);
  return context?.access.canManage ? context : null;
}

async function saveRepository(
  context: NonNullable<Awaited<ReturnType<typeof managerContext>>>,
  projectId: string,
  repository: Parameters<typeof repositoryRecord>[0],
) {
  const { error } = await context.admin.from("project_repositories").upsert({
    project_id: projectId,
    workspace_id: context.access.project.workspace_id,
    installation_id: context.installation.installation_id,
    created_by: context.userId,
    ...repositoryRecord(repository),
  }, { onConflict: "project_id" });
  if (error) {
    if (error.code === "23505") throw new Error("repository_already_linked");
    throw error;
  }
}

export async function linkGitHubRepository(
  _previous: GitHubRepositoryFormState,
  form: FormData,
): Promise<GitHubRepositoryFormState> {
  const projectId = read(form, "project_id");
  const repositoryId = Number(read(form, "repository_id"));
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0)
    return { error: "Elige un repositorio válido.", success: null };

  const context = await managerContext(projectId);
  if (!context) return { error: "No tienes permiso o GitHub no está conectado.", success: null };

  try {
    const repository = await getGitHubInstallationRepository(
      context.config,
      context.installation.installation_id,
      repositoryId,
    );
    await saveRepository(context, projectId, repository);
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: `${repository.full_name} quedó vinculado al proyecto.` };
  } catch (error) {
    if (error instanceof Error && error.message === "repository_already_linked")
      return { error: "Ese repositorio ya está vinculado a otro proyecto de Armario Dev.", success: null };
    console.error("Could not link GitHub repository", error);
    return { error: friendlyGitHubError(error), success: null };
  }
}

export async function createAndLinkGitHubRepository(
  _previous: GitHubRepositoryFormState,
  form: FormData,
): Promise<GitHubRepositoryFormState> {
  const projectId = read(form, "project_id");
  const name = read(form, "name");
  const description = read(form, "description").slice(0, 1000);
  const visibility = read(form, "visibility");
  const gitignoreValue = read(form, "gitignore");
  const licenseValue = read(form, "license");
  const gitignore = gitignoreValue === "none" ? "" : gitignoreValue;
  const license = licenseValue === "none" ? "" : licenseValue;
  if (!repositoryName.test(name))
    return { error: "Usa entre 1 y 100 caracteres: letras, números, punto, guion o guion bajo.", success: null };
  if (!new Set(["public", "private"]).has(visibility))
    return { error: "Elige una visibilidad válida.", success: null };
  if (gitignore && !gitignoreTemplates.has(gitignore))
    return { error: "La plantilla de .gitignore no es válida.", success: null };
  if (license && !licenseTemplates.has(license))
    return { error: "La licencia seleccionada no es válida.", success: null };

  const context = await managerContext(projectId);
  if (!context) return { error: "No tienes permiso o GitHub no está conectado.", success: null };
  const permissions = context.installation.permissions as Record<string, string>;
  if (permissions.administration !== "write")
    return { error: "Activa el permiso Administration: Read and write en la GitHub App.", success: null };

  let repository: Awaited<ReturnType<typeof createGitHubRepository>>;
  try {
    repository = await createGitHubRepository(context.config, {
      installationId: context.installation.installation_id,
      accountLogin: context.installation.account_login,
      accountType: context.installation.account_type,
    }, {
      name,
      description,
      visibility: visibility as "public" | "private",
      initializeReadme: form.get("initialize_readme") === "on",
      gitignoreTemplate: gitignore || undefined,
      licenseTemplate: license || undefined,
    });
  } catch (error) {
    console.error("Could not create GitHub repository", error);
    return { error: friendlyGitHubError(error), success: null };
  }

  try {
    await saveRepository(context, projectId, repository);
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: `${repository.full_name} fue creado y vinculado.` };
  } catch (error) {
    console.error("Repository was created but could not be linked", error);
    return { error: `${repository.full_name} se creó en GitHub, pero no pudo vincularse. Selecciónalo desde “Vincular existente”.`, success: null };
  }
}

export async function unlinkGitHubRepository(
  _previous: GitHubRepositoryFormState,
  form: FormData,
): Promise<GitHubRepositoryFormState> {
  const projectId = read(form, "project_id");
  const context = await managerContext(projectId);
  if (!context) return { error: "No tienes permiso para desvincular el repositorio.", success: null };

  const { data, error } = await context.admin.from("project_repositories")
    .delete().eq("project_id", projectId).eq("workspace_id", context.access.project.workspace_id)
    .select("full_name").maybeSingle();
  if (error) return { error: "No se pudo desvincular el repositorio.", success: null };
  if (!data) return { error: "El proyecto ya no tiene un repositorio vinculado.", success: null };

  revalidatePath(`/projects/${projectId}`);
  return { error: null, success: `${data.full_name} fue desvinculado. El repositorio no se eliminó de GitHub.` };
}

export async function createGitHubBranch(
  _previous: GitHubRepositoryFormState,
  form: FormData,
): Promise<GitHubRepositoryFormState> {
  const projectId = read(form, "project_id");
  const branch = read(form, "branch");
  const baseBranch = read(form, "base_branch");
  if (!isValidGitBranchName(branch))
    return { error: "Usa un nombre de rama válido, sin espacios ni caracteres reservados.", success: null };
  if (!isValidGitBranchName(baseBranch))
    return { error: "Elige una rama base válida.", success: null };

  const context = await linkedManagerContext(projectId);
  if (!context) return { error: "No tienes permiso o el proyecto no tiene un repositorio vinculado.", success: null };
  if ((context.installation.permissions as Record<string, string>).contents !== "write")
    return { error: "Activa el permiso Contents: Read and write en la GitHub App.", success: null };

  try {
    await createGitHubBranchRemote(
      context.config,
      context.installation.installation_id,
      context.repository.owner_login,
      context.repository.name,
      branch,
      baseBranch,
    );
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: `La rama ${branch} fue creada desde ${baseBranch}.` };
  } catch (error) {
    console.error("Could not create GitHub branch", error);
    return { error: friendlyGitHubError(error), success: null };
  }
}

export async function deleteGitHubBranch(
  _previous: GitHubRepositoryFormState,
  form: FormData,
): Promise<GitHubRepositoryFormState> {
  const projectId = read(form, "project_id");
  const branch = read(form, "branch");
  if (!isValidGitBranchName(branch)) return { error: "La rama no es válida.", success: null };

  const context = await linkedManagerContext(projectId);
  if (!context) return { error: "No tienes permiso o el proyecto no tiene un repositorio vinculado.", success: null };
  if ((context.installation.permissions as Record<string, string>).contents !== "write")
    return { error: "Activa el permiso Contents: Read and write en la GitHub App.", success: null };

  try {
    await deleteGitHubBranchRemote(
      context.config,
      context.installation.installation_id,
      context.repository.owner_login,
      context.repository.name,
      branch,
    );
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: `La rama ${branch} fue eliminada.` };
  } catch (error) {
    console.error("Could not delete GitHub branch", error);
    return { error: friendlyGitHubError(error), success: null };
  }
}

export async function publishGitHubDocuments(
  _previous: GitHubRepositoryFormState,
  form: FormData,
): Promise<GitHubRepositoryFormState> {
  const projectId = read(form, "project_id");
  const branch = read(form, "branch");
  const expectedHeadSha = read(form, "expected_head_sha");
  const message = read(form, "commit_message").slice(0, 240);
  const references = [...new Set(form.getAll("documents").filter((value): value is string => typeof value === "string"))];
  if (!isValidGitBranchName(branch)) return { error: "Elige una rama válida.", success: null };
  if (!/^[0-9a-f]{40}$/i.test(expectedHeadSha)) return { error: "Actualiza la actividad antes de publicar.", success: null };
  if (!message) return { error: "Escribe un mensaje para el commit.", success: null };
  if (!references.length || references.length > 100) return { error: "Selecciona entre 1 y 100 documentos.", success: null };

  const context = await linkedManagerContext(projectId);
  if (!context) return { error: "No tienes permiso o el proyecto no tiene un repositorio vinculado.", success: null };
  if ((context.installation.permissions as Record<string, string>).contents !== "write")
    return { error: "Activa el permiso Contents: Read and write en la GitHub App.", success: null };

  let jobId: string | null = null;
  const jobPayload: Record<string, unknown> = { branch, expectedHeadSha, documents: references };
  try {
    const documents = await loadPublishableDocuments(context, projectId, references);
    jobId = await createSyncJob(context, projectId, "publish_documents", jobPayload);
    const commit = await commitFilesToGitHub({
      config: context.config,
      installationId: context.installation.installation_id,
      owner: context.repository.owner_login,
      repository: context.repository.name,
      branch,
      expectedHeadSha,
      message,
      files: documents.map((document) => ({ path: document.path, content: document.content })),
    });
    const publishedAt = new Date().toISOString();
    const { error: publicationError } = await context.admin.from("github_publications").upsert(
      documents.map((document) => ({
        project_id: projectId,
        workspace_id: context.access.project.workspace_id,
        repository_id: context.repository.repository_id,
        source_type: document.sourceType,
        source_id: document.sourceId,
        path: document.path,
        branch,
        last_commit_sha: commit.sha,
        published_by: context.userId,
        published_at: publishedAt,
      })),
      { onConflict: "project_id,source_type,source_id" },
    );
    if (publicationError) console.error("Could not save GitHub publication trace", publicationError);
    await finishSyncJob(context, jobId, "completed", {
      ...jobPayload,
      commitSha: commit.sha,
      commitUrl: commit.html_url,
      paths: documents.map((document) => document.path),
      traceSaved: !publicationError,
    });
    revalidatePath(`/projects/${projectId}`);
    return {
      error: null,
      success: `${documents.length} documento${documents.length === 1 ? "" : "s"} publicado${documents.length === 1 ? "" : "s"} en ${branch}.`,
      commitUrl: commit.html_url,
    };
  } catch (error) {
    console.error("Could not publish Armario documents", error);
    const friendly = error instanceof Error && ["github_invalid_document", "github_documents_load_failed"].includes(error.message)
      ? "No se pudieron cargar todos los documentos seleccionados."
      : friendlyGitHubError(error);
    if (jobId) await finishSyncJob(context, jobId, "failed", jobPayload, friendly);
    return { error: friendly, success: null };
  }
}

export async function synchronizeGitHubRepository(
  _previous: GitHubRepositoryFormState,
  form: FormData,
): Promise<GitHubRepositoryFormState> {
  const projectId = read(form, "project_id");
  const branch = read(form, "branch");
  if (!isValidGitBranchName(branch)) return { error: "Elige una rama válida.", success: null };
  const context = await linkedManagerContext(projectId);
  if (!context) return { error: "No tienes permiso o el proyecto no tiene un repositorio vinculado.", success: null };
  if ((context.installation.permissions as Record<string, string>).contents !== "write")
    return { error: "Activa el permiso Contents: Read and write en la GitHub App.", success: null };

  let jobId: string | null = null;
  const payload: Record<string, unknown> = { branch };
  try {
    jobId = await createSyncJob(context, projectId, "repository_sync", payload);
    const result = await synchronizeRepositoryWithRunner({
      config: context.config,
      installationId: context.installation.installation_id,
      owner: context.repository.owner_login,
      repository: context.repository.name,
      branch,
    });
    await finishSyncJob(context, jobId, "completed", { ...payload, ...result });
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: result.changed ? `La rama ${branch} fue actualizada y subida.` : `La rama ${branch} ya estaba sincronizada.` };
  } catch (error) {
    console.error("Could not synchronize repository with Git runner", error);
    const friendly = friendlyGitHubError(error);
    if (jobId) await finishSyncJob(context, jobId, "failed", payload, friendly);
    return { error: friendly, success: null };
  }
}
