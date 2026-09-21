import { DocumentationPageShell } from "@/components/documentation-page-shell";
import { DiagramForm } from "@/components/documentation-forms";
import { diagramKinds, diagramTemplates } from "@/lib/documentation-model";
import { requireEditableProject } from "@/lib/project-access";

export default async function NewDiagramPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string }>;
}) {
  const { id } = await params;
  const requestedKind = (await searchParams).kind;
  const kind = diagramKinds.some((item) => item.value === requestedKind) ? requestedKind as keyof typeof diagramTemplates : "flow";
  const { project } = await requireEditableProject(id);
  return <DocumentationPageShell projectId={id} projectTitle={project.title} title="Nuevo diagrama" description="Parte de una plantilla editable y adapta el plano al proyecto.">
    <DiagramForm projectId={id} initialKind={kind} initialSource={diagramTemplates[kind]} />
  </DocumentationPageShell>;
}
