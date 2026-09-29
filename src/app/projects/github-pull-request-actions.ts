"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { isValidGitBranchName } from "@/lib/github/branch-name";
import { getLinkedGitHubProject } from "@/lib/github/project-context";
import {
  createGitHubPullRequest as createRemotePullRequest,
  getGitHubPullRequestDetail,
  mergeGitHubPullRequest as mergeRemotePullRequest,
  reviewGitHubPullRequest as reviewRemotePullRequest,
  updateGitHubPullRequest as updateRemotePullRequest,
} from "@/lib/github/pull-requests";
import { deleteGitHubBranch as deleteRemoteBranch } from "@/lib/github/repository-activity";

export type GitHubPullRequestFormState = { error: string | null; success: string | null; url?: string | null };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha = /^[0-9a-f]{40}$/i;
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

function permissionsAllow(context: NonNullable<Awaited<ReturnType<typeof managerContext>>>, permission: "pull_requests" | "contents") {
  return (context.installation.permissions as Record<string, string>)[permission] === "write";
}

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "github_pull_changed" || message === "github_api_409") return "El pull request cambió antes de completar la operación. Actualiza y vuelve a intentarlo.";
  if (message === "github_api_401") return "GitHub rechazó la autenticación. Vuelve a conectar la App.";
  if (message === "github_api_403") return "La GitHub App o las reglas del repositorio no permiten esta operación.";
  if (message === "github_api_404") return "El pull request o la rama ya no existe.";
  if (message === "github_api_405") return "GitHub no permite fusionar este pull request en su estado actual.";
  if (message === "github_api_422") return "GitHub rechazó la operación. Revisa ramas, reglas y estado del pull request.";
  if (message.startsWith("github_dns_") || message === "github_api_timeout") return "No se pudo comunicar con GitHub. Inténtalo de nuevo.";
  return "No se pudo completar la operación con el pull request.";
}

const pullNumber = (form: FormData) => Number(read(form, "pull_number"));
const validPullNumber = (value: number) => Number.isSafeInteger(value) && value > 0;

export async function createGitHubPullRequest(
  _previous: GitHubPullRequestFormState,
  form: FormData,
): Promise<GitHubPullRequestFormState> {
  const projectId = read(form, "project_id");
  const title = read(form, "title").slice(0, 256);
  const body = read(form, "body").slice(0, 65_000);
  const head = read(form, "head");
  const base = read(form, "base");
  if (!title) return { error: "Escribe un título.", success: null };
  if (!isValidGitBranchName(head) || !isValidGitBranchName(base) || head === base)
    return { error: "Elige dos ramas diferentes y válidas.", success: null };
  const context = await managerContext(projectId);
  if (!context) return { error: "No tienes permiso o el repositorio no está vinculado.", success: null };
  if (!permissionsAllow(context, "pull_requests")) return { error: "Activa Pull requests: Read and write en la GitHub App.", success: null };

  try {
    const pullRequest = await createRemotePullRequest({
      config: context.config,
      installationId: context.installation.installation_id,
      owner: context.repository.owner_login,
      repository: context.repository.name,
      title,
      body,
      head,
      base,
      draft: form.get("draft") === "on",
    });
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: `Pull request #${pullRequest.number} creado.`, url: pullRequest.html_url };
  } catch (error) {
    console.error("Could not create GitHub pull request", error);
    return { error: friendlyError(error), success: null };
  }
}

export async function editGitHubPullRequest(
  _previous: GitHubPullRequestFormState,
  form: FormData,
): Promise<GitHubPullRequestFormState> {
  const projectId = read(form, "project_id");
  const number = pullNumber(form);
  const title = read(form, "title").slice(0, 256);
  const body = read(form, "body").slice(0, 65_000);
  const base = read(form, "base");
  if (!validPullNumber(number) || !title || !isValidGitBranchName(base)) return { error: "Los datos del pull request no son válidos.", success: null };
  const context = await managerContext(projectId);
  if (!context || !permissionsAllow(context, "pull_requests")) return { error: "No tienes permiso para editar pull requests.", success: null };
  try {
    await updateRemotePullRequest({ config: context.config, installationId: context.installation.installation_id, owner: context.repository.owner_login, repository: context.repository.name, number, title, body, base });
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: `Pull request #${number} actualizado.` };
  } catch (error) {
    console.error("Could not edit GitHub pull request", error);
    return { error: friendlyError(error), success: null };
  }
}

export async function setGitHubPullRequestState(
  _previous: GitHubPullRequestFormState,
  form: FormData,
): Promise<GitHubPullRequestFormState> {
  const projectId = read(form, "project_id");
  const number = pullNumber(form);
  const state = read(form, "state");
  if (!validPullNumber(number) || !["open", "closed"].includes(state)) return { error: "Estado no válido.", success: null };
  const context = await managerContext(projectId);
  if (!context || !permissionsAllow(context, "pull_requests")) return { error: "No tienes permiso para cambiar el estado.", success: null };
  try {
    await updateRemotePullRequest({ config: context.config, installationId: context.installation.installation_id, owner: context.repository.owner_login, repository: context.repository.name, number, state: state as "open" | "closed" });
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: state === "closed" ? `Pull request #${number} cerrado.` : `Pull request #${number} reabierto.` };
  } catch (error) {
    console.error("Could not change GitHub pull request state", error);
    return { error: friendlyError(error), success: null };
  }
}

export async function reviewGitHubPullRequest(
  _previous: GitHubPullRequestFormState,
  form: FormData,
): Promise<GitHubPullRequestFormState> {
  const projectId = read(form, "project_id");
  const number = pullNumber(form);
  const event = read(form, "event");
  const body = read(form, "body").slice(0, 65_000);
  if (!validPullNumber(number) || !["APPROVE", "REQUEST_CHANGES", "COMMENT"].includes(event)) return { error: "Revisión no válida.", success: null };
  if (event === "REQUEST_CHANGES" && !body) return { error: "Explica qué cambios deben realizarse.", success: null };
  const context = await managerContext(projectId);
  if (!context || !permissionsAllow(context, "pull_requests")) return { error: "No tienes permiso para revisar pull requests.", success: null };
  try {
    await reviewRemotePullRequest({ config: context.config, installationId: context.installation.installation_id, owner: context.repository.owner_login, repository: context.repository.name, number, body, event: event as "APPROVE" | "REQUEST_CHANGES" | "COMMENT" });
    revalidatePath(`/projects/${projectId}`);
    const label = event === "APPROVE" ? "aprobado" : event === "REQUEST_CHANGES" ? "marcado con cambios solicitados" : "comentado";
    return { error: null, success: `Pull request #${number} ${label}.` };
  } catch (error) {
    console.error("Could not review GitHub pull request", error);
    return { error: friendlyError(error), success: null };
  }
}

export async function mergeGitHubPullRequest(
  _previous: GitHubPullRequestFormState,
  form: FormData,
): Promise<GitHubPullRequestFormState> {
  const projectId = read(form, "project_id");
  const number = pullNumber(form);
  const expectedHeadSha = read(form, "expected_head_sha");
  const method = read(form, "merge_method");
  const commitTitle = read(form, "commit_title").slice(0, 256);
  const commitMessage = read(form, "commit_message").slice(0, 65_000);
  if (!validPullNumber(number) || !sha.test(expectedHeadSha) || !["merge", "squash", "rebase"].includes(method) || !commitTitle)
    return { error: "Los datos del merge no son válidos.", success: null };
  const context = await managerContext(projectId);
  if (!context || !permissionsAllow(context, "pull_requests") || !permissionsAllow(context, "contents"))
    return { error: "No tienes permiso para fusionar o faltan permisos de GitHub.", success: null };

  try {
    const detail = await getGitHubPullRequestDetail(context.config, context.installation.installation_id, context.repository.owner_login, context.repository.name, number);
    const pullRequest = detail.pullRequest;
    if (pullRequest.head.sha !== expectedHeadSha) throw new Error("github_pull_changed");
    if (pullRequest.state !== "open" || pullRequest.draft) return { error: "El pull request debe estar abierto y listo para revisión.", success: null };
    const result = await mergeRemotePullRequest({
      config: context.config,
      installationId: context.installation.installation_id,
      owner: context.repository.owner_login,
      repository: context.repository.name,
      number,
      expectedHeadSha,
      method: method as "merge" | "squash" | "rebase",
      commitTitle,
      commitMessage,
    });
    if (!result.merged) return { error: result.message || "GitHub no pudo fusionar el pull request.", success: null };

    let branchMessage = "";
    if (form.get("delete_branch") === "on") {
      const sameRepository = pullRequest.head.repo?.full_name === context.repository.full_name;
      if (sameRepository && pullRequest.head.ref !== context.repository.default_branch) {
        try {
          await deleteRemoteBranch(context.config, context.installation.installation_id, context.repository.owner_login, context.repository.name, pullRequest.head.ref);
          branchMessage = ` La rama ${pullRequest.head.ref} fue eliminada.`;
        } catch (branchError) {
          console.error("Pull request merged but branch could not be deleted", branchError);
          branchMessage = " El merge terminó, pero la rama no pudo eliminarse.";
        }
      }
    }
    revalidatePath(`/projects/${projectId}`);
    return { error: null, success: `Pull request #${number} fusionado.${branchMessage}` };
  } catch (error) {
    console.error("Could not merge GitHub pull request", error);
    return { error: friendlyError(error), success: null };
  }
}

