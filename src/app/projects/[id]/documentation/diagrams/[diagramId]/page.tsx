import { notFound } from "next/navigation";
import { archiveDiagram } from "@/app/projects/documentation-actions";
import { DocumentationPageShell } from "@/components/documentation-page-shell";
import { DiagramForm, type DiagramValues } from "@/components/documentation-forms";
import { Button } from "@/components/ui/button";
import { requireProjectAccess } from "@/lib/project-access";

export default async function DiagramPage({ params }: { params: Promise<{ id: string; diagramId: string }> }) {
  const { id, diagramId } = await params;
  const { db, project, canEdit } = await requireProjectAccess(id);
  const { data } = await db.from("project_diagrams").select("id,title,kind,source,status")
    .eq("id", diagramId).eq("project_id", id).maybeSingle();
  if (!data) notFound();
  return <DocumentationPageShell projectId={id} projectTitle={project.title} title={data.title} description="Edita la fuente y comprueba el resultado antes de guardarlo.">
    <DiagramForm projectId={id} diagram={data as DiagramValues} readOnly={!canEdit} />
    {canEdit && <form action={archiveDiagram} className="mt-6">
      <input type="hidden" name="project_id" value={id} /><input type="hidden" name="diagram_id" value={diagramId} />
      <input type="hidden" name="status" value={data.status === "archived" ? "active" : "archived"} />
      <Button type="submit" variant="outline">{data.status === "archived" ? "Restaurar diagrama" : "Archivar diagrama"}</Button>
    </form>}
  </DocumentationPageShell>;
}
