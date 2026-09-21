import { DocumentationPageShell } from "@/components/documentation-page-shell";
import { TechnologyForm } from "@/components/documentation-forms";
import { requireEditableProject } from "@/lib/project-access";

export default async function NewTechnologyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await requireEditableProject(id);
  return <DocumentationPageShell projectId={id} projectTitle={project.title} title="Añadir tecnología" description="Registra una candidata, una elección o una alternativa descartada con su motivo.">
    <TechnologyForm projectId={id} />
  </DocumentationPageShell>;
}
