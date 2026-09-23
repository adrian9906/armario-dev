"use server";

import { randomInt } from "node:crypto";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { withSuccessToast } from "@/lib/success-toast";
import { sendWorkspaceInvitation } from "@/lib/email/workspace-invitation";
import { hashInvitationCode } from "@/lib/invitations/code";

export type FormState = { error: string | null };
type Role = "owner" | "admin" | "editor" | "viewer";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const kinds = ["web", "mobile", "frontend", "backend", "mixed", "other", "undecided"];

function value(data: FormData, key: string) {
  const item = data.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function validId(id: string) {
  return uuidPattern.test(id);
}

async function actor() {
  const { userId } = await auth();
  if (!userId) throw new Error("Debes iniciar sesión.");
  return userId;
}

async function roleFor(workspaceId: string, userId: string): Promise<Role | null> {
  if (!validId(workspaceId)) return null;
  const { data, error } = await createClient().from("workspace_memberships")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data?.role as Role | undefined) ?? null;
}

function workspaceUrl(id: string, view = "ideas") {
  return `/dashboard?workspace=${encodeURIComponent(id)}&view=${view}`;
}

function ideaInput(data: FormData): { title: string; description: string; kind: string; tags: string[] } | string {
  const title = value(data, "title");
  const description = value(data, "description");
  const kind = value(data, "kind") || "undecided";
  const tags = [...new Set(value(data, "tags").split(",").map((tag) => tag.trim()).filter(Boolean))];
  if (!title || title.length > 160) return "El título debe tener entre 1 y 160 caracteres.";
  if (description.length > 10000) return "Las notas no pueden superar 10 000 caracteres.";
  if (!kinds.includes(kind)) return "Elige un tipo válido.";
  if (tags.length > 12 || tags.some((tag) => tag.length > 30)) return "Usa hasta 12 etiquetas de 30 caracteres como máximo.";
  return { title, description, kind, tags };
}

export async function createWorkspace(_state: FormState, data: FormData): Promise<FormState> {
  await actor();
  const name = value(data, "name");
  if (!name) return { error: "No se pudo crear el espacio porque el nombre está vacío." };
  if (name.length > 120) return {
    error: "No se pudo crear el espacio porque el nombre es demasiado largo. Usa 120 caracteres como máximo.",
  };
  const supabase = createClient();
  const user = await currentUser();
  const setup = await supabase.rpc("ensure_personal_workspace", { chosen_name: user?.fullName || user?.firstName || "Creador" });
  if (setup.error) return { error: "No se pudo preparar tu cuenta. Inténtalo otra vez." };
  const { data: workspaceId, error } = await supabase.rpc("create_shared_workspace", { chosen_name: name });
  if (error || !workspaceId) return { error: "No se pudo crear el espacio. Inténtalo otra vez." };
  revalidatePath("/dashboard");
  redirect(withSuccessToast(workspaceUrl(workspaceId), `Espacio “${name}” creado.`));
}

export async function renameWorkspace(_state: FormState, data: FormData): Promise<FormState> {
  const userId = await actor();
  const workspaceId = value(data, "workspace_id");
  const name = value(data, "name");
  if (!name || name.length > 120) return { error: "Escribe un nombre de hasta 120 caracteres." };
  if (!(["owner", "admin"] as (Role | null)[]).includes(await roleFor(workspaceId, userId)))
    return { error: "No tienes permiso para cambiar este espacio." };
  const { data: updated, error } = await createClient().from("workspaces")
    .update({ name }).eq("id", workspaceId).select("id").maybeSingle();
  if (error || !updated) return { error: "No se pudo guardar el nombre." };
  revalidatePath("/dashboard");
  redirect(withSuccessToast(workspaceUrl(workspaceId, "team"), `Nombre cambiado a “${name}”.`));
}

export async function renameProfile(_state: FormState, data: FormData): Promise<FormState> {
  const userId = await actor();
  const workspaceId = value(data, "workspace_id");
  const name = value(data, "name");
  if (!name) return { error: "El nombre no puede estar vacío." };
  if (name.length > 120) return { error: "El nombre no puede superar 120 caracteres." };
  if (!await roleFor(workspaceId, userId)) return { error: "No perteneces a este espacio." };

  try {
    const clerk = await clerkClient();
    await clerk.users.updateUser(userId, { firstName: name });
  } catch {
    return { error: "No se pudo actualizar el nombre de tu cuenta." };
  }
  const { data: updated, error } = await createClient().from("profiles")
    .update({ display_name: name }).eq("id", userId).select("id").maybeSingle();
  if (error || !updated) return { error: "La cuenta cambió, pero no pudimos actualizar el nombre para el equipo. Recarga la página." };

  revalidatePath("/dashboard");
  revalidatePath("/projects", "layout");
  redirect(withSuccessToast(workspaceUrl(workspaceId, "team"), `Ahora apareces como “${name}”.`));
}

export async function createIdea(_state: FormState, data: FormData): Promise<FormState> {
  const userId = await actor();
  const workspaceId = value(data, "workspace_id");
  const input = ideaInput(data);
  if (typeof input === "string") return { error: input };
  if (!(["owner", "admin", "editor"] as (Role | null)[]).includes(await roleFor(workspaceId, userId)))
    return { error: "No tienes permiso para crear ideas en este espacio." };
  const { data: createdId, error } = await createAdminClient().rpc("create_workspace_idea", {
    actor_id: userId,
    target_workspace_id: workspaceId,
    idea_title: input.title,
    idea_description: input.description,
    idea_kind: input.kind,
    idea_tags: input.tags,
  });
  if (error || !createdId) return { error: "No se pudo guardar la idea. Actualiza la página e inténtalo otra vez." };
  revalidatePath("/dashboard");
  redirect(withSuccessToast(`/ideas/${createdId}?workspace=${workspaceId}`, "Idea creada."));
}

export async function updateIdea(_state: FormState, data: FormData): Promise<FormState> {
  const userId = await actor();
  const workspaceId = value(data, "workspace_id");
  const ideaId = value(data, "idea_id");
  const input = ideaInput(data);
  if (typeof input === "string") return { error: input };
  if (!validId(ideaId) || !(["owner", "admin", "editor"] as (Role | null)[]).includes(await roleFor(workspaceId, userId)))
    return { error: "No tienes permiso para editar esta idea." };
  const { data: updated, error } = await createClient().from("ideas")
    .update(input).eq("id", ideaId).eq("workspace_id", workspaceId).neq("status", "converted").select("id").maybeSingle();
  if (error || !updated) return { error: "No se pudo actualizar la idea." };
  revalidatePath("/dashboard");
  revalidatePath(`/ideas/${ideaId}`);
  redirect(withSuccessToast(`/ideas/${ideaId}?workspace=${workspaceId}`, "Cambios de la idea guardados."));
}

export async function setIdeaArchived(data: FormData) {
  const userId = await actor();
  const workspaceId = value(data, "workspace_id");
  const ideaId = value(data, "idea_id");
  const nextStatus = value(data, "status");
  if (!validId(ideaId) || !["active", "archived"].includes(nextStatus)
      || !(["owner", "admin", "editor"] as (Role | null)[]).includes(await roleFor(workspaceId, userId)))
    throw new Error("No tienes permiso para cambiar esta idea.");
  const { data: updated, error } = await createClient().from("ideas")
    .update({ status: nextStatus }).eq("id", ideaId).eq("workspace_id", workspaceId).neq("status", "converted")
    .select("id").maybeSingle();
  if (error || !updated) throw new Error("No se pudo cambiar el estado de la idea.");
  revalidatePath("/dashboard");
  revalidatePath(`/ideas/${ideaId}`);
  redirect(withSuccessToast(
    `/ideas/${ideaId}?workspace=${workspaceId}`,
    nextStatus === "archived" ? "Idea archivada." : "Idea restaurada.",
  ));
}

export async function inviteMember(_state: FormState, data: FormData): Promise<FormState> {
  const userId = await actor();
  const workspaceId = value(data, "workspace_id");
  const email = value(data, "email").toLowerCase();
  const role = value(data, "role");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254)
    return { error: "Escribe un correo válido." };
  if (!["admin", "editor", "viewer"].includes(role)) return { error: "Selecciona un rol válido." };
  if (!(["owner", "admin"] as (Role | null)[]).includes(await roleFor(workspaceId, userId)))
    return { error: "No tienes permiso para invitar personas." };

  const code = randomInt(100000, 1000000).toString();
  const tokenHash = hashInvitationCode(code);
  const admin = createAdminClient();
  const { data: invitationId, error } = await admin.rpc("create_workspace_invitation", {
    actor_id: userId, target_workspace_id: workspaceId, invited_email: email,
    invited_role: role, new_token_hash: tokenHash,
  });
  if (error || !invitationId) return { error: "No se pudo crear la invitación. Revisa el límite de 20 por hora." };

  try {
    const { data: workspace } = await admin.from("workspaces")
      .select("name").eq("id", workspaceId).maybeSingle();
    if (!workspace?.name) throw new Error("workspace_not_found");
    const deliveryId = await sendWorkspaceInvitation({
      to: email,
      code,
      workspaceName: workspace.name,
      role,
      invitationId,
    });
    await admin.rpc("mark_workspace_invitation_sent", {
      actor_id: userId,
      invitation_id: invitationId,
      provider_delivery_id: deliveryId,
    });
  } catch (deliveryError) {
    await admin.rpc("revoke_workspace_invitation", { actor_id: userId, invitation_id: invitationId });
    const deliveryCode = deliveryError instanceof Error ? deliveryError.message : "";
    return {
      error: deliveryCode === "missing_email_configuration"
        ? "Falta configurar el servicio de correo. Agrega RESEND_API_KEY, INVITATION_FROM_EMAIL y NEXT_PUBLIC_APP_URL."
        : deliveryCode === "missing_gmail_configuration"
          ? "Falta configurar Gmail. Agrega GMAIL_USER y GMAIL_APP_PASSWORD en .env.local."
          : deliveryCode === "invalid_gmail_app_password_format"
            ? "La contraseña de aplicación de Gmail debe contener exactamente los 16 caracteres generados por Google."
          : deliveryCode === "gmail_authentication_failed"
            ? "Gmail rechazó el acceso. Usa una contraseña de aplicación de 16 caracteres, no la contraseña normal."
        : deliveryCode === "public_sender_domain"
          ? "El remitente no puede ser Gmail, Outlook u otro correo público. Usa una dirección de un dominio propio verificado en Resend."
          : deliveryCode === "unverified_sender_domain"
            ? "Resend rechazó el remitente porque su dominio todavía no está verificado. Verifica el dominio y vuelve a intentarlo."
            : "No se pudo enviar el correo de invitación. Comprueba el remitente e inténtalo otra vez.",
    };
  }
  revalidatePath("/dashboard");
  redirect(withSuccessToast(workspaceUrl(workspaceId, "team"), `Invitación enviada a ${email}.`));
}

export async function revokeInvitation(data: FormData) {
  const userId = await actor();
  const workspaceId = value(data, "workspace_id");
  const invitationId = value(data, "invitation_id");
  if (!validId(invitationId) || !(["owner", "admin"] as (Role | null)[]).includes(await roleFor(workspaceId, userId)))
    throw new Error("No tienes permiso para revocar esta invitación.");
  const admin = createAdminClient();
  const { data: invitation } = await admin.from("workspace_invitations")
    .select("workspace_id").eq("id", invitationId).maybeSingle();
  if (invitation?.workspace_id !== workspaceId) throw new Error("Invitación no encontrada.");
  const { error } = await admin.rpc("revoke_workspace_invitation", { actor_id: userId, invitation_id: invitationId });
  if (error) throw new Error("No se pudo revocar la invitación.");
  revalidatePath("/dashboard");
  redirect(withSuccessToast(workspaceUrl(workspaceId, "team"), "Invitación revocada."));
}

export async function changeMember(data: FormData) {
  const userId = await actor();
  const workspaceId = value(data, "workspace_id");
  const targetId = value(data, "user_id");
  const role = value(data, "role");
  if (!targetId || !["admin", "editor", "viewer", "remove"].includes(role)
      || !(["owner", "admin"] as (Role | null)[]).includes(await roleFor(workspaceId, userId)))
    throw new Error("No tienes permiso para cambiar a esta persona.");
  const admin = createAdminClient();
  const { data: changed, error } = await admin.rpc("manage_workspace_member", {
    actor_id: userId, target_workspace_id: workspaceId, target_user_id: targetId,
    next_role: role === "remove" ? null : role,
  });
  if (error || !changed) throw new Error("No se pudo cambiar el rol o retirar a la persona.");
  const { data: savedMembership } = await admin.from("workspace_memberships")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", targetId).maybeSingle();
  if ((role === "remove" && savedMembership) || (role !== "remove" && savedMembership?.role !== role)) {
    throw new Error("El rol no quedó guardado. Actualiza la página e inténtalo otra vez.");
  }
  revalidatePath("/dashboard");
  revalidatePath("/projects", "layout");
  redirect(withSuccessToast(
    workspaceUrl(workspaceId, "team"),
    role === "remove" ? "Persona retirada del espacio." : "Rol actualizado.",
  ));
}
