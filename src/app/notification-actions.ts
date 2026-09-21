"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const read = (form: FormData, name: string) => { const item = form.get(name); return typeof item === "string" ? item.trim() : ""; };

export async function markNotificationRead(form: FormData) {
  const { userId } = await auth.protect();
  const id = read(form, "notification_id");
  if (!uuid.test(id)) throw new Error("Notificación no válida.");
  const { error } = await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("recipient_id", userId);
  if (error) throw new Error("No se pudo marcar la notificación.");
  revalidatePath("/dashboard");
}

export async function markAllNotificationsRead(form: FormData) {
  const { userId } = await auth.protect();
  const workspaceId = read(form, "workspace_id");
  if (!uuid.test(workspaceId)) throw new Error("Espacio no válido.");
  const db = createClient();
  const { data: membership } = await db.from("workspace_memberships").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (!membership) throw new Error("No tienes acceso a este espacio.");
  const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId).eq("recipient_id", userId).is("read_at", null);
  if (error) throw new Error("No se pudieron marcar las notificaciones.");
  revalidatePath("/dashboard");
}

export type NotificationPreferenceState = { error: string | null; success?: string };

export async function saveNotificationPreferences(_state: NotificationPreferenceState, form: FormData): Promise<NotificationPreferenceState> {
  const { userId } = await auth.protect();
  const workspaceId = read(form, "workspace_id");
  if (!uuid.test(workspaceId)) return { error: "Espacio no válido." };
  const db = createClient();
  const { data: membership } = await db.from("workspace_memberships").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (!membership) return { error: "No tienes acceso a este espacio." };
  const { error } = await db.from("notification_preferences").upsert({
    workspace_id: workspaceId, user_id: userId,
    assignments: form.get("assignments") === "on", comments: form.get("comments") === "on",
    project_access: form.get("project_access") === "on",
  }, { onConflict: "workspace_id,user_id" });
  if (error) return { error: "No se pudieron guardar las preferencias." };
  revalidatePath("/dashboard");
  return { error: null, success: "Preferencias guardadas." };
}
