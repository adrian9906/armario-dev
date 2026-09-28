"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getGitHubAppConfig } from "@/lib/github/env";
import { isValidGitBranchName } from "@/lib/github/branch-name";
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

export type GitHubRepositoryFormState = { error: string | null; success: string | null };

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
  if (message.startsWith("github_dns_") || message === "github_api_timeout")
    return "No se pudo comunicar con GitHub. Inténtalo de nuevo.";
  return "No se pudo completar la operación con GitHub.";
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
