import { WorkspaceAppShell } from "@/components/workspace-app-shell";
import { requireProjectAccess } from "@/lib/project-access";

export default async function ProjectLayout({ children, params }: LayoutProps<"/projects/[id]">) {
  const { id } = await params;
  const { project, canEdit } = await requireProjectAccess(id);

  return (
    <WorkspaceAppShell
      workspaceId={project.workspace_id}
      activeSection="projects"
      project={{ id: project.id, title: project.title, canEdit }}
    >
      {children}
    </WorkspaceAppShell>
  );
}
