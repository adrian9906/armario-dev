"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSuccessToast } from "@/lib/success-toast";
import { hashInvitationCode } from "@/lib/invitations/code";

export type AcceptState = { error: string | null };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function acceptInvitation(_state: AcceptState, data: FormData): Promise<AcceptState> {
  const { userId } = await auth();
  if (!userId) return { error: "Inicia sesión para aceptar la invitación." };
  const invitationId = data.get("invitation_id");
  const code = data.get("code");
  if (typeof invitationId !== "string" || !uuidPattern.test(invitationId)
      || typeof code !== "string" || !/^\d{6}$/.test(code)) {
    return { error: "Escribe los seis dígitos del código." };
  }

  const user = await currentUser();
  if (!user) return { error: "No pudimos verificar tu cuenta." };
  const db = createAdminClient();
  const { data: invite } = await db.from("workspace_invitations")
    .select("email,status,expires_at").eq("id", invitationId).maybeSingle();
  if (!invite || invite.status !== "pending" || new Date(invite.expires_at) <= new Date()) {
    return { error: "La invitación venció, fue revocada o ya se utilizó." };
  }
  const verified = user.emailAddresses.find((address) =>
    address.emailAddress.toLowerCase() === invite.email
    && address.verification?.status === "verified");
  if (!verified) return { error: "Inicia sesión con la cuenta del correo invitado para continuar." };

  const { data: result, error } = await db.rpc("verify_workspace_invitation_code", {
    accepting_user_id: userId,
    verified_email: verified.emailAddress.toLowerCase(),
    display_name: user.fullName || user.firstName || "Creador",
    invitation_id: invitationId,
    raw_code: hashInvitationCode(code),
  });
  const verification = Array.isArray(result) ? result[0] : result;
  if (error || !verification) return { error: "No se pudo comprobar el código. Inténtalo otra vez." };
  if (!verification.accepted || !verification.target_workspace_id) {
    if (verification.result_code === "wrong_code") {
      return { error: `El código no es correcto. Te quedan ${verification.remaining_attempts} intentos.` };
    }
    if (verification.result_code === "attempts_exhausted") {
      return { error: "El código fue bloqueado tras cinco intentos. Pide una invitación nueva." };
    }
    if (verification.result_code === "account_mismatch") {
      return { error: "La cuenta abierta no coincide con el correo invitado." };
    }
    return { error: "La invitación venció, fue revocada o ya no está disponible." };
  }

  revalidatePath("/dashboard");
  redirect(withSuccessToast(
    `/dashboard?workspace=${verification.target_workspace_id}&view=overview`,
    "Invitación verificada. Ya tienes acceso al espacio.",
  ));
}
