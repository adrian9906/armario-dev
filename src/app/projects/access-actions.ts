"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getProjectAccess } from "@/lib/project-access";
import type { ProjectRole, ProjectVisibility } from "@/lib/project-permissions";

export type AccessFormState = { error: string | null; success?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const read = (form: FormData, name: string) => { const item = form.get(name); return typeof item === "string" ? item.trim() : ""; };

async function manager(form: FormData) {
  const { userId } = await auth();
  const projectId = read(form, "project_id");
  if (!userId || !uuid.test(projectId)) return null;
  const access = await getProjectAccess(projectId, userId);
  return access?.canManage ? access : null;
}

export async function updateProjectVisibility(_state: AccessFormState, form: FormData): Promise<AccessFormState> {
  const access = await manager(form);
  const visibility = read(form, "visibility") as ProjectVisibility;
  if (!access || !["workspace", "private", "restricted"].includes(visibility)) return { error: "No tienes permiso para cambiar este acceso." };
  const { error } = await access.db.from("projects").update({ visibility }).eq("id", access.project.id);
  if (error) return { error: "No se pudo cambiar la visibilidad del proyecto." };
  revalidatePath("/dashboard"); revalidatePath(`/projects/${access.project.id}`);
  return { error: null, success: "Visibilidad actualizada." };
}

export async function addProjectMember(_state: AccessFormState, form: FormData): Promise<AccessFormState> {
  const access = await manager(form);
  const memberId = read(form, "user_id");
  const role = read(form, "role") as ProjectRole;
  if (!access || !memberId || !["manager", "editor", "contributor", "viewer"].includes(role)) return { error: "Revisa la persona y el rol." };
  if (memberId === access.project.creator_id) return { error: "La persona responsable ya administra el proyecto." };
  const { data: member } = await access.db.from("workspace_memberships").select("user_id")
    .eq("workspace_id", access.project.workspace_id).eq("user_id", memberId).maybeSingle();
  if (!member) return { error: "La persona debe pertenecer al espacio." };
  const { error } = await access.db.from("project_memberships").upsert({
    project_id: access.project.id, workspace_id: access.project.workspace_id,
    user_id: memberId, role, added_by: access.userId,
  }, { onConflict: "project_id,user_id" });
  if (error) return { error: "No se pudo guardar el acceso de esta persona." };
  revalidatePath(`/projects/${access.project.id}`);
  return { error: null, success: "Acceso guardado." };
}

export async function removeProjectMember(form: FormData) {
  const access = await manager(form);
  const memberId = read(form, "user_id");
  if (!access || !memberId || memberId === access.project.creator_id) throw new Error("No tienes permiso para retirar este acceso.");
  const { error } = await access.db.from("project_memberships").delete().eq("project_id", access.project.id).eq("user_id", memberId);
  if (error) throw new Error("No se pudo retirar el acceso.");
  revalidatePath(`/projects/${access.project.id}`);
}
