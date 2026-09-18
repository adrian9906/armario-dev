"use server";

import { createHash } from "node:crypto";
import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export type AcceptState = { error: string | null };
export async function acceptInvitation(_state: AcceptState, data: FormData): Promise<AcceptState> {
  const { userId } = await auth();
  if (!userId) return { error: "Inicia sesión para aceptar la invitación." };
  const token = data.get("token");
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return { error: "El enlace no es válido." };
  const user = await currentUser();
  if (!user) return { error: "No pudimos verificar tu cuenta." };
  const db = createAdminClient();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: invite } = await db.from("workspace_invitations")
    .select("email,status,expires_at").eq("token_hash", hash).maybeSingle();
  if (!invite || invite.status !== "pending" || new Date(invite.expires_at) <= new Date())
    return { error: "La invitación venció o ya no está disponible." };
  const verified = user.emailAddresses.find((address) =>
    address.emailAddress.toLowerCase() === invite.email && address.verification?.status === "verified");
  if (!verified) return { error: "Inicia sesión con la cuenta del correo invitado para continuar." };
  const { data: workspaceId, error } = await db.rpc("accept_workspace_invitation", {
    accepting_user_id: userId, verified_email: verified.emailAddress.toLowerCase(),
    display_name: user.firstName || user.fullName || "Creador", raw_token: token,
  });
  if (error || !workspaceId) return { error: "No se pudo aceptar la invitación. Actualiza la página e inténtalo otra vez." };
  revalidatePath("/dashboard");
  redirect(`/dashboard?workspace=${workspaceId}&view=overview`);
}
