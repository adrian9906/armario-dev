import { createAdminClient } from "@/lib/supabase/admin";
import { processGitHubAutomationWebhook } from "@/lib/github/automation";
import { getGitHubWebhookSecret } from "@/lib/github/env";
import { verifyGitHubWebhookSignature } from "@/lib/github/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumPayloadBytes = 25 * 1024 * 1024;

export async function POST(request: Request) {
  const webhookSecret = getGitHubWebhookSecret();
  if (!webhookSecret) return Response.json({ error: "El webhook de GitHub no está configurado." }, { status: 503 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumPayloadBytes)
    return Response.json({ error: "El evento supera el tamaño permitido." }, { status: 413 });

  const event = request.headers.get("x-github-event")?.trim();
  const deliveryId = request.headers.get("x-github-delivery")?.trim();
  const signature = request.headers.get("x-hub-signature-256");
  if (!event || !deliveryId)
    return Response.json({ error: "Faltan cabeceras de GitHub." }, { status: 400 });

  const payload = await request.text();
  if (Buffer.byteLength(payload, "utf8") > maximumPayloadBytes)
    return Response.json({ error: "El evento supera el tamaño permitido." }, { status: 413 });
  if (!verifyGitHubWebhookSignature(payload, signature, webhookSecret))
    return Response.json({ error: "Firma de webhook inválida." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "El cuerpo del webhook no es JSON válido." }, { status: 400 });
  }

  const installation = body.installation as { id?: number; account?: { id?: number; login?: string; type?: string }; repository_selection?: string; permissions?: Record<string, string>; suspended_at?: string | null } | undefined;
  const repository = body.repository as { id?: number } | undefined;
  const action = typeof body.action === "string" ? body.action.slice(0, 120) : null;
  const admin = createAdminClient();
  const { error } = await admin.from("github_webhook_deliveries").insert({
    delivery_id: deliveryId,
    event,
    action,
    installation_id: Number.isSafeInteger(installation?.id) ? installation?.id : null,
    repository_id: Number.isSafeInteger(repository?.id) ? repository?.id : null,
    payload: body,
  });
  if (error?.code === "23505") return Response.json({ accepted: true, duplicate: true }, { status: 200 });
  if (error) return Response.json({ error: "No se pudo registrar el webhook." }, { status: 500 });

  if (event === "installation" && installation?.id) {
    const status = action === "suspend" ? "suspended" : action === "deleted" ? "revoked" : "active";
    const values: Record<string, unknown> = { status };
    if (installation.permissions) values.permissions = installation.permissions;
    if (installation.repository_selection) values.repository_selection = installation.repository_selection;
    if (installation.account?.id) values.account_id = installation.account.id;
    if (installation.account?.login) values.account_login = installation.account.login;
    if (["User", "Organization", "Enterprise"].includes(installation.account?.type ?? "")) values.account_type = installation.account?.type;
    await admin.from("github_installations").update(values).eq("installation_id", installation.id);
  }

  try {
    const automation = await processGitHubAutomationWebhook({ event, action, deliveryId, body });
    await admin.from("github_webhook_deliveries")
      .update({ status: automation.processed ? "processed" : "ignored", processed_at: new Date().toISOString(), attempt_count: 1 })
      .eq("delivery_id", deliveryId);
    return Response.json({ accepted: true, event, deliveryId, automation }, { status: 202 });
  } catch (automationError) {
    const message = automationError instanceof Error ? automationError.message : "github_automation_failed";
    await admin.from("github_webhook_deliveries")
      .update({ status: "failed", processed_at: new Date().toISOString(), attempt_count: 1, error: message.slice(0, 2000) })
      .eq("delivery_id", deliveryId);
    return Response.json({ error: "El evento fue recibido, pero no pudo sincronizarse." }, { status: 500 });
  }
}
