import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ListTodo } from "lucide-react";
import { TaskForm } from "@/components/project-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  const db = createClient();
  const { data: project } = await db.from("projects").select("id,workspace_id,title").eq("id", id).maybeSingle();
  if (!project) notFound();
  const [{ data: member }, { data: memberships }] = await Promise.all([
    db.from("workspace_memberships").select("role").eq("workspace_id", project.workspace_id).eq("user_id", userId).maybeSingle(),
    db.from("workspace_memberships").select("user_id").eq("workspace_id", project.workspace_id),
  ]);
  if (!member || !["owner", "admin", "editor"].includes(member.role)) notFound();
  const ids = (memberships ?? []).map((item) => item.user_id);
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  return <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 lg:py-12"><Link href={`/projects/${id}?view=tasks`} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a las tareas</Link><Badge className="mt-10 mb-4 block w-fit border-0 bg-pastel-sky px-4 py-2 text-foreground">Nueva tarea</Badge><h1 className="text-[2.35rem] leading-[1.12] font-bold tracking-[-0.045em]">Crear tarea</h1><p className="mt-2 text-muted-foreground">Una acción concreta para avanzar en {project.title}.</p><Card className="mt-8"><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender"><ListTodo aria-hidden /></div><CardTitle>Detalles de la tarea</CardTitle><CardDescription>Puedes preparar el checklist ahora. Los comentarios y vínculos con requisitos se añaden después.</CardDescription></CardHeader><CardContent><TaskForm projectId={id} members={ids.map((memberId) => ({ user_id: memberId, name: names.get(memberId) || "Miembro" }))} /></CardContent></Card></main>;
}
