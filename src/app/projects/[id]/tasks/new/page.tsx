import Link from "next/link";
import { ArrowLeft, ListTodo } from "lucide-react";
import { TaskForm } from "@/components/project-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEditableProject } from "@/lib/project-access";
import { canAssignProjectMember } from "@/lib/project-permissions";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, project } = await requireEditableProject(id);
  const [{ data: memberships }, { data: projectMemberships }] = await Promise.all([
    db.from("workspace_memberships").select("user_id,role").eq("workspace_id", project.workspace_id),
    db.from("project_memberships").select("user_id").eq("project_id", id),
  ]);
  const explicitIds = new Set((projectMemberships ?? []).map((item) => item.user_id));
  const ids = (memberships ?? []).filter((member) => canAssignProjectMember(project, member, explicitIds)).map((item) => item.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  return <main className="workspace-canvas max-w-4xl"><Link href={`/projects/${id}?view=tasks`} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a las tareas</Link><Badge className="workspace-kicker mt-9 mb-5 bg-pastel-sky">Nueva tarea</Badge><h1 className="workspace-title">Crear tarea</h1><p className="workspace-subtitle mt-4">Una acción concreta para avanzar en {project.title}.</p><Card className="content-panel mt-8"><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender"><ListTodo aria-hidden /></div><CardTitle>Detalles de la tarea</CardTitle><CardDescription>Puedes preparar el checklist ahora. Los comentarios y vínculos con requisitos se añaden después.</CardDescription></CardHeader><CardContent><TaskForm projectId={id} members={ids.map((memberId) => ({ user_id: memberId, name: names.get(memberId) || "Miembro" }))} /></CardContent></Card></main>;
}
