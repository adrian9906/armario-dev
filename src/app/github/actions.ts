"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withSuccessToast } from "@/lib/success-toast";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function disconnectGitHub(form: FormData) {
  const { userId } = await auth.protect();
  const workspaceId = String(form.get("workspace_id") ?? "");
  if (!uuid.test(workspaceId)) throw new Error("El espacio no es válido.");

  const db = createClient();
  const { data: membership } = await db.from("workspace_memberships").select("role")
    .eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle();
  if (!membership || !["owner", "admin"].includes(membership.role))
    throw new Error("No tienes permiso para desconectar GitHub.");

  const { error } = await db.from("github_installations").delete().eq("workspace_id", workspaceId);
  if (error) throw new Error("No se pudo desconectar GitHub.");

  revalidatePath("/dashboard");
  redirect(withSuccessToast(`/dashboard?workspace=${workspaceId}&view=team`, "GitHub fue desconectado de este espacio."));
}
