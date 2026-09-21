"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  decisionStatuses,
  diagramKinds,
  technologyByKey,
  technologyStatuses,
} from "@/lib/documentation-model";
import { createClient } from "@/lib/supabase/server";
import { getProjectAccess } from "@/lib/project-access";

export type DocumentationFormState = { error: string | null };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const read = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};
const allowed = (value: string, options: readonly { value: string }[]) =>
  options.some((option) => option.value === value);
const documentationUrl = (projectId: string) => `/projects/${projectId}?view=documentation`;

async function editableProject(projectId: string) {
  const { userId } = await auth();
  if (!userId || !uuid.test(projectId)) return null;
  const access = await getProjectAccess(projectId, userId);
  return access?.canEdit ? { ...access.project, userId } : null;
}

export async function saveTechnology(
  _state: DocumentationFormState,
  form: FormData,
): Promise<DocumentationFormState> {
  const projectId = read(form, "project_id");
  const technologyId = read(form, "technology_id");
  const project = await editableProject(projectId);
  if (!project || (technologyId && !uuid.test(technologyId)))
    return { error: "No tienes permiso para guardar esta tecnología." };

  const technology = technologyByKey(read(form, "technology_key"));
  const status = read(form, "status");
  const version = read(form, "version");
  const rationale = read(form, "rationale");
  if (!technology || version.length > 80 || rationale.length > 5000
    || !allowed(status, technologyStatuses))
    return { error: "Selecciona una tecnología válida y revisa el estado, la versión y el motivo." };

  const db = createClient();
  const values = { name: technology.name, category: technology.category, status, version, rationale };
  const result = technologyId
    ? await db.from("project_technologies").update(values)
      .eq("id", technologyId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
      .select("id").maybeSingle()
    : await db.from("project_technologies").insert({
      ...values, project_id: projectId, workspace_id: project.workspace_id, creator_id: project.userId,
    }).select("id").single();
  if (result.error || !result.data)
    return { error: result.error?.code === "23505" ? "Esta tecnología ya está registrada." : "No se pudo guardar la tecnología." };
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/documentation/stack/${result.data.id}`);
}

export async function saveDecision(
  _state: DocumentationFormState,
  form: FormData,
): Promise<DocumentationFormState> {
  const projectId = read(form, "project_id");
  const decisionId = read(form, "decision_id");
  const project = await editableProject(projectId);
  if (!project || (decisionId && !uuid.test(decisionId)))
    return { error: "No tienes permiso para guardar esta decisión." };

  const title = read(form, "title");
  const status = read(form, "status");
  const context = read(form, "context");
  const decision = read(form, "decision");
  const consequences = read(form, "consequences");
  const decidedAt = read(form, "decided_at");
  if (!title || title.length > 160 || !allowed(status, decisionStatuses)
    || context.length > 10000 || decision.length > 10000 || consequences.length > 10000
    || !/^\d{4}-\d{2}-\d{2}$/.test(decidedAt))
    return { error: "Revisa el título, el estado, la fecha y el contenido del ADR." };

  const db = createClient();
  const values = { title, status, context, decision, consequences, decided_at: decidedAt };
  const result = decisionId
    ? await db.from("architecture_decisions").update(values)
      .eq("id", decisionId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
      .select("id").maybeSingle()
    : await db.from("architecture_decisions").insert({
      ...values, project_id: projectId, workspace_id: project.workspace_id, creator_id: project.userId,
    }).select("id").single();
  if (result.error || !result.data) return { error: "No se pudo guardar la decisión." };
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/documentation/decisions/${result.data.id}`);
}

export async function saveDiagram(
  _state: DocumentationFormState,
  form: FormData,
): Promise<DocumentationFormState> {
  const projectId = read(form, "project_id");
  const diagramId = read(form, "diagram_id");
  const project = await editableProject(projectId);
  if (!project || (diagramId && !uuid.test(diagramId)))
    return { error: "No tienes permiso para guardar este diagrama." };

  const title = read(form, "title");
  const kind = read(form, "kind");
  const source = read(form, "source");
  const status = read(form, "status") || "active";
  if (!title || title.length > 160 || !source || source.length > 50000
    || !allowed(kind, diagramKinds) || !["active", "archived"].includes(status))
    return { error: "Revisa el título, el tipo y el contenido del diagrama." };

  const db = createClient();
  const values = { title, kind, source, status };
  const result = diagramId
    ? await db.from("project_diagrams").update(values)
      .eq("id", diagramId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
      .select("id").maybeSingle()
    : await db.from("project_diagrams").insert({
      ...values, project_id: projectId, workspace_id: project.workspace_id, creator_id: project.userId,
    }).select("id").single();
  if (result.error || !result.data) return { error: "No se pudo guardar el diagrama." };
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}/documentation/diagrams/${result.data.id}`);
}

export async function archiveDiagram(form: FormData) {
  const projectId = read(form, "project_id");
  const diagramId = read(form, "diagram_id");
  const status = read(form, "status");
  const project = await editableProject(projectId);
  if (!project || !uuid.test(diagramId) || !["active", "archived"].includes(status))
    throw new Error("No tienes permiso para cambiar este diagrama.");
  const { data, error } = await createClient().from("project_diagrams").update({ status })
    .eq("id", diagramId).eq("project_id", projectId).eq("workspace_id", project.workspace_id)
    .select("id").maybeSingle();
  if (error || !data) throw new Error("No se pudo cambiar el diagrama.");
  revalidatePath(`/projects/${projectId}`);
  redirect(status === "archived" ? documentationUrl(projectId) : `/projects/${projectId}/documentation/diagrams/${diagramId}`);
}
