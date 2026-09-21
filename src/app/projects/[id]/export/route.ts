import { auth } from "@clerk/nextjs/server";
import { createClient } from "@/lib/supabase/server";
import {
  decisionStatuses,
  diagramKinds,
  optionLabel,
  technologyCategories,
  technologyStatuses,
} from "@/lib/documentation-model";
import { projectKinds, projectStages, requirementKinds, requirementPriorities, taskPriorities, taskStatuses } from "@/lib/project-model";

export const dynamic = "force-dynamic";

const clean = (value: string | null | undefined) => value?.trim() || "Sin definir";
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "proyecto";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await auth.protect();
  const { id } = await context.params;
  const db = createClient();
  const { data: project } = await db.from("projects")
    .select("id,title,objective,kind,stage,created_at").eq("id", id).maybeSingle();
  if (!project) return new Response("Proyecto no encontrado", { status: 404 });

  const [requirements, tasks, technologies, decisions, diagrams] = await Promise.all([
    db.from("requirements").select("title,description,acceptance_criteria,kind,priority,status").eq("project_id", id).order("position"),
    db.from("tasks").select("title,description,status,priority,start_date,due_date").eq("project_id", id).order("position"),
    db.from("project_technologies").select("name,category,status,version,rationale").eq("project_id", id).order("category"),
    db.from("architecture_decisions").select("title,status,context,decision,consequences,decided_at").eq("project_id", id).order("decided_at"),
    db.from("project_diagrams").select("title,kind,source,status").eq("project_id", id).eq("status", "active").order("updated_at"),
  ]);
  if ([requirements, tasks, technologies, decisions, diagrams].some((result) => result.error))
    return new Response("No se pudo generar la exportación", { status: 500 });

  const lines: string[] = [
    `# ${project.title}`,
    "",
    `- Tipo: ${optionLabel(projectKinds, project.kind)}`,
    `- Etapa: ${optionLabel(projectStages, project.stage)}`,
    `- Creado: ${project.created_at.slice(0, 10)}`,
    "",
    "## Objetivo",
    "",
    clean(project.objective),
    "",
    "## Stack tecnológico",
    "",
  ];
  for (const item of technologies.data ?? []) {
    lines.push(`### ${item.name}${item.version ? ` ${item.version}` : ""}`, "",
      `- Categoría: ${optionLabel(technologyCategories, item.category)}`,
      `- Estado: ${optionLabel(technologyStatuses, item.status)}`, "", clean(item.rationale), "");
  }
  if (!technologies.data?.length) lines.push("Sin tecnologías registradas.", "");

  lines.push("## Decisiones de arquitectura", "");
  for (const item of decisions.data ?? []) {
    lines.push(`### ${item.title}`, "", `- Estado: ${optionLabel(decisionStatuses, item.status)}`,
      `- Fecha: ${item.decided_at}`, "", "**Contexto**", "", clean(item.context), "",
      "**Decisión**", "", clean(item.decision), "", "**Consecuencias**", "", clean(item.consequences), "");
  }
  if (!decisions.data?.length) lines.push("Sin decisiones registradas.", "");

  lines.push("## Diagramas", "");
  for (const item of diagrams.data ?? []) {
    lines.push(`### ${item.title}`, "", `Tipo: ${optionLabel(diagramKinds, item.kind)}`, "", "```mermaid", item.source, "```", "");
  }
  if (!diagrams.data?.length) lines.push("Sin diagramas activos.", "");

  lines.push("## Requisitos", "");
  for (const item of (requirements.data ?? []).filter((row) => row.status === "active")) {
    lines.push(`### ${item.title}`, "", `- Clase: ${optionLabel(requirementKinds, item.kind)}`,
      `- Prioridad: ${optionLabel(requirementPriorities, item.priority)}`, "", clean(item.description), "",
      "**Criterios de aceptación**", "", clean(item.acceptance_criteria), "");
  }
  if (!requirements.data?.some((row) => row.status === "active")) lines.push("Sin requisitos activos.", "");

  lines.push("## Tareas", "");
  for (const item of (tasks.data ?? []).filter((row) => row.status !== "archived")) {
    lines.push(`- **${item.title}** — ${optionLabel(taskStatuses, item.status)}, ${optionLabel(taskPriorities, item.priority)}`
      + `${item.start_date ? ` · inicio ${item.start_date}` : ""}${item.due_date ? ` · fin ${item.due_date}` : ""}`,
      item.description ? `  ${item.description.replace(/\n/g, " ")}` : "");
  }
  if (!tasks.data?.some((row) => row.status !== "archived")) lines.push("Sin tareas activas.");

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug(project.title)}.md"`,
      "Cache-Control": "private, no-store",
    },
  });
}
