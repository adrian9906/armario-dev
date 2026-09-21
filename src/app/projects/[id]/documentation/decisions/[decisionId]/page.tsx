import { notFound } from "next/navigation";
import { DocumentationPageShell } from "@/components/documentation-page-shell";
import { DecisionForm, type DecisionValues } from "@/components/documentation-forms";
import { requireProjectAccess } from "@/lib/project-access";

export default async function DecisionPage({ params }: { params: Promise<{ id: string; decisionId: string }> }) {
  const { id, decisionId } = await params;
  const { db, project, canEdit } = await requireProjectAccess(id);
  const { data } = await db.from("architecture_decisions")
    .select("id,title,status,context,decision,consequences,decided_at")
    .eq("id", decisionId).eq("project_id", id).maybeSingle();
  if (!data) notFound();
  return <DocumentationPageShell projectId={id} projectTitle={project.title} title={data.title} description="Registro de decisión de arquitectura del proyecto.">
    <DecisionForm projectId={id} decision={data as DecisionValues} readOnly={!canEdit} />
  </DocumentationPageShell>;
}
