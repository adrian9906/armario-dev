import "server-only";

import nodemailer from "nodemailer";
import { Resend } from "resend";

const roleNames: Record<string, string> = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Lector",
};

const publicEmailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
]);

function senderDomain(from: string) {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  return address.trim().toLowerCase().split("@")[1] ?? "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

export async function sendWorkspaceInvitation({
  to,
  code,
  workspaceName,
  role,
  invitationId,
}: {
  to: string;
  code: string;
  workspaceName: string;
  role: string;
  invitationId: string;
}) {
  const provider = process.env.EMAIL_PROVIDER?.toLowerCase()
    || (process.env.GMAIL_USER ? "gmail" : "resend");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) throw new Error("missing_email_configuration");

  const invitationUrl = new URL("/invitaciones/aceptar", appUrl);
  invitationUrl.searchParams.set("id", invitationId);
  const roleName = roleNames[role] ?? role;
  const safeWorkspace = escapeHtml(workspaceName);
  const safeRole = escapeHtml(roleName);
  const safeUrl = escapeHtml(invitationUrl.toString());
  const subject = `Tu código para entrar a ${workspaceName}`;
  const text = [
    `Te invitaron a colaborar en ${workspaceName} como ${roleName}.`,
    `Tu código de acceso es: ${code}`,
    `Abre ${invitationUrl.toString()} e inicia sesión con ${to}.`,
    "El código vence en 7 días y solo se usa la primera vez que entras a este espacio.",
  ].join("\n\n");
  const html = `
    <div style="background:#f6f7fb;padding:40px 16px;font-family:Arial,sans-serif;color:#25252b">
      <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e6e7ee;border-radius:20px;padding:32px">
        <p style="margin:0 0 24px;font-size:20px;font-weight:700">Armario <span style="color:#635bff">Dev</span></p>
        <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2">Te invitaron a ${safeWorkspace}</h1>
        <p style="margin:0 0 24px;color:#666672;line-height:1.6">Tu rol será <strong>${safeRole}</strong>. Inicia sesión con este mismo correo y escribe el código:</p>
        <div style="margin:0 0 24px;border-radius:16px;background:#eceaff;padding:20px;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px">${code}</div>
        <a href="${safeUrl}" style="display:inline-block;border-radius:12px;background:#635bff;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px">Abrir invitación</a>
        <p style="margin:24px 0 0;color:#777783;font-size:13px;line-height:1.5">El código vence en 7 días y solo se solicita la primera vez que entras a este espacio. No lo compartas.</p>
      </div>
    </div>
  `;

  if (provider === "gmail") {
    const user = process.env.GMAIL_USER;
    const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
    if (!user || !appPassword) throw new Error("missing_gmail_configuration");
    if (!/^[a-z0-9]{16}$/i.test(appPassword)) throw new Error("invalid_gmail_app_password_format");
    const from = `Armario Dev <${user.trim()}>`;
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass: appPassword },
    });
    try {
      const delivery = await transporter.sendMail({ from, to, subject, text, html });
      return delivery.messageId;
    } catch (error) {
      const responseCode = typeof error === "object" && error && "responseCode" in error
        ? Number(error.responseCode)
        : 0;
      if (responseCode === 535) throw new Error("gmail_authentication_failed");
      throw new Error("email_delivery_failed");
    }
  }

  if (provider !== "resend") throw new Error("unsupported_email_provider");
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITATION_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("missing_email_configuration");
  if (publicEmailDomains.has(senderDomain(from))) throw new Error("public_sender_domain");

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({ from, to, subject, text, html });
  if (error || !data?.id) {
    if (error?.message.toLowerCase().includes("domain is not verified")) {
      throw new Error("unverified_sender_domain");
    }
    throw new Error(error?.message ?? "email_delivery_failed");
  }
  return data.id;
}
