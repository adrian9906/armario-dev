import { DocumentationPageShell } from "@/components/documentation-page-shell";
import { DecisionForm } from "@/components/documentation-forms";
import { requireEditableProject } from "@/lib/project-access";

export default async function NewDecisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await requireEditableProject(id);
  return <DocumentationPageShell projectId={id} projectTitle={project.title} title="Nueva decisión ADR" description="Documenta el contexto, la elección y sus consecuencias para conservar el porqué.">
    <DecisionForm projectId={id} />
  </DocumentationPageShell>;
}
