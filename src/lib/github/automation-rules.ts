const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "tarea";

export function taskBranchName(prefix: string, taskId: string, title: string) {
  return `${prefix}/${taskId.slice(0, 8)}-${slug(title)}`;
}

export function taskStatusFromIssue(action: string, hasBranch: boolean) {
  if (action === "closed") return "done" as const;
  if (action === "reopened") return hasBranch ? "in_progress" as const : "todo" as const;
  return null;
}

export function taskIdFromGitHubBody(body: string | null | undefined) {
  const value = body?.match(/<!-- armario-dev-task:([0-9a-f-]{36}) -->/i)?.[1] ?? null;
  return value && uuid.test(value) ? value : null;
}

export function webhookDedupeKey(deliveryId: string, event: string, action: string | null) {
  return `github:${deliveryId}:${event}:${action ?? "none"}`;
}
