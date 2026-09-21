import { notFound } from "next/navigation";
import { DocumentationPageShell } from "@/components/documentation-page-shell";
import { TechnologyForm, type TechnologyValues } from "@/components/documentation-forms";
import { requireProjectAccess } from "@/lib/project-access";

export default async function TechnologyPage({ params }: { params: Promise<{ id: string; technologyId: string }> }) {
  const { id, technologyId } = await params;
  const { db, project, canEdit } = await requireProjectAccess(id);
  const { data } = await db.from("project_technologies").select("id,name,category,status,version,rationale")
    .eq("id", technologyId).eq("project_id", id).maybeSingle();
  if (!data) notFound();
  return <DocumentationPageShell projectId={id} projectTitle={project.title} title={data.name} description="Actualiza la categoría, el estado y la justificación de esta elección técnica.">
    <TechnologyForm projectId={id} technology={data as TechnologyValues} readOnly={!canEdit} />
  </DocumentationPageShell>;
}
