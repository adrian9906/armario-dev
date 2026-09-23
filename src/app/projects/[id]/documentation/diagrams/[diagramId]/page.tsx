import Link from "next/link";
import { notFound } from "next/navigation";
import { GitBranch, History, Link2 } from "lucide-react";
import { archiveDiagram, restoreDiagramVersion, toggleDiagramLink } from "@/app/projects/documentation-actions";
import { DocumentationPageShell } from "@/components/documentation-page-shell";
import { DiagramForm, type DiagramValues } from "@/components/documentation-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProjectAccess } from "@/lib/project-access";

type Version = { id: string; version_number: number; title: string; kind: string; source: string; status: string; change_summary: string; created_by: string | null; created_at: string };
const date = (value: string) => new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default async function DiagramPage({ params }: { params: Promise<{ id: string; diagramId: string }> }) {
  const { id, diagramId } = await params;
  const { db, project, canEdit } = await requireProjectAccess(id);
  const [{ data }, versionsResult, requirementsResult, decisionsResult, requirementLinksResult, decisionLinksResult] = await Promise.all([
    db.from("project_diagrams").select("id,title,kind,source,status").eq("id", diagramId).eq("project_id", id).maybeSingle(),
    db.from("project_diagram_versions").select("id,version_number,title,kind,source,status,change_summary,created_by,created_at").eq("diagram_id", diagramId).order("version_number", { ascending: false }),
    db.from("requirements").select("id,title,status").eq("project_id", id).order("position"),
    db.from("architecture_decisions").select("id,title,status").eq("project_id", id).order("decided_at", { ascending: false }),
    db.from("diagram_requirements").select("requirement_id").eq("diagram_id", diagramId),
    db.from("diagram_decisions").select("decision_id").eq("diagram_id", diagramId),
  ]);
  if (!data) notFound();
  const versions = (versionsResult.data ?? []) as Version[];
  const requirements = (requirementsResult.data ?? []).filter((item) => item.status === "active");
  const decisions = decisionsResult.data ?? [];
  const requirementLinks = new Set((requirementLinksResult.data ?? []).map((item) => item.requirement_id));
  const decisionLinks = new Set((decisionLinksResult.data ?? []).map((item) => item.decision_id));
  const authorIds = [...new Set(versions.flatMap((version) => version.created_by ? [version.created_by] : []))];
  const { data: profiles } = authorIds.length ? await db.from("profiles").select("id,display_name").in("id", authorIds) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));

  return <DocumentationPageShell projectId={id} projectTitle={project.title} title={data.title} description="Edita, relaciona y recupera cualquier versión del diagrama.">
    <DiagramForm projectId={id} diagram={data as DiagramValues} readOnly={!canEdit} />
    {canEdit && <form action={archiveDiagram} className="mt-6"><input type="hidden" name="project_id" value={id} /><input type="hidden" name="diagram_id" value={diagramId} /><input type="hidden" name="status" value={data.status === "archived" ? "active" : "archived"} /><Button type="submit" variant="outline">{data.status === "archived" ? "Restaurar diagrama" : "Archivar diagrama"}</Button></form>}

    <div className="mt-8 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card><CardHeader><div className="flex size-11 items-center justify-center rounded-2xl bg-pastel-lavender"><History aria-hidden /></div><CardTitle>Historial de versiones</CardTitle><CardDescription>Cada guardado conserva una copia inmutable. Restaurar crea una versión nueva y mantiene las anteriores.</CardDescription></CardHeader><CardContent className="space-y-3">{versions.map((version, index) => <details key={version.id} className="rounded-2xl border border-border/70 p-4" open={index === 0}><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Versión {version.version_number}{index === 0 ? " · actual" : ""}</p><p className="mt-1 text-xs text-muted-foreground">{version.change_summary || "Sin resumen"} · {names.get(version.created_by ?? "") || "Sistema"}</p></div><time className="text-xs text-muted-foreground" dateTime={version.created_at}>{date(version.created_at)}</time></div></summary><pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-muted p-4 text-xs whitespace-pre-wrap">{version.source}</pre>{canEdit && index > 0 && <form action={restoreDiagramVersion} className="mt-4"><input type="hidden" name="project_id" value={id} /><input type="hidden" name="diagram_id" value={diagramId} /><input type="hidden" name="version_id" value={version.id} /><Button type="submit" size="sm" variant="outline">Restaurar esta versión</Button></form>}</details>)}{!versions.length && <p className="text-sm text-muted-foreground">El historial comenzará con el próximo guardado.</p>}</CardContent></Card>

      <Card><CardHeader><div className="flex size-11 items-center justify-center rounded-2xl bg-pastel-sky"><GitBranch aria-hidden /></div><CardTitle>Trazabilidad</CardTitle><CardDescription>Relaciona el diagrama con lo que define y con las decisiones que lo explican.</CardDescription></CardHeader><CardContent className="space-y-7"><RelationList title="Requisitos" items={requirements} linked={requirementLinks} targetType="requirement" projectId={id} diagramId={diagramId} canEdit={canEdit} /><RelationList title="Decisiones ADR" items={decisions} linked={decisionLinks} targetType="decision" projectId={id} diagramId={diagramId} canEdit={canEdit} /></CardContent></Card>
    </div>
  </DocumentationPageShell>;
}

function RelationList({ title, items, linked, targetType, projectId, diagramId, canEdit }: {
  title: string; items: { id: string; title: string; status: string }[]; linked: Set<string>;
  targetType: "requirement" | "decision"; projectId: string; diagramId: string; canEdit: boolean;
}) {
  return <section><div className="mb-3 flex items-center gap-2"><Link2 className="size-4" aria-hidden /><h2 className="text-sm font-semibold">{title}</h2><Badge variant="secondary">{items.filter((item) => linked.has(item.id)).length}</Badge></div><div className="space-y-2">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3"><Link href={targetType === "requirement" ? `/projects/${projectId}/requirements/${item.id}` : `/projects/${projectId}/documentation/decisions/${item.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary">{item.title}</Link>{canEdit ? <form action={toggleDiagramLink}><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="diagram_id" value={diagramId} /><input type="hidden" name="target_id" value={item.id} /><input type="hidden" name="target_type" value={targetType} /><input type="hidden" name="operation" value={linked.has(item.id) ? "remove" : "add"} /><Button type="submit" size="xs" variant={linked.has(item.id) ? "secondary" : "outline"}>{linked.has(item.id) ? "Vinculado" : "Vincular"}</Button></form> : linked.has(item.id) ? <Badge variant="secondary">Vinculado</Badge> : null}</div>)}{!items.length && <p className="text-sm text-muted-foreground">No hay elementos disponibles en este proyecto.</p>}</div></section>;
}
