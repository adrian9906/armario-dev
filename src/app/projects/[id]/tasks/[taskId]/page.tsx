import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, CheckCircle2, Link2, MessageCircle, RotateCcw } from "lucide-react";
import { setTaskStatus, toggleRequirementLink } from "@/app/projects/actions";
import { Brand } from "@/components/brand";
import { ChecklistToggle } from "@/components/checklist-toggle";
import { ChecklistAddForm, CommentForm, TaskForm } from "@/components/project-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requirementPriorities, taskPriorities, taskStatuses } from "@/lib/project-model";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const label = (choices: readonly { value: string; label: string }[], value: string) => choices.find((item) => item.value === value)?.label ?? value;
const date = (value: string) => new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(value));
const taskDates = (start: string | null, end: string | null) => start && end
  ? ` · ${date(`${start}T12:00:00Z`)} – ${date(`${end}T12:00:00Z`)}`
  : end ? ` · vence ${date(`${end}T12:00:00Z`)}` : "";

export default async function TaskPage({ params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { userId } = await auth.protect();
  const { id, taskId } = await params;
  const db = createClient();
  const { data: task } = await db.from("tasks")
    .select("id,project_id,workspace_id,title,description,status,priority,assignee_id,start_date,due_date,position,created_at")
    .eq("id", taskId).eq("project_id", id).maybeSingle();
  if (!task) notFound();
  const [projectResponse, membershipResponse, membersResponse, checklistResponse, requirementsResponse, linksResponse, commentsResponse] = await Promise.all([
    db.from("projects").select("title").eq("id", id).eq("workspace_id", task.workspace_id).maybeSingle(),
    db.from("workspace_memberships").select("role").eq("workspace_id", task.workspace_id).eq("user_id", userId).maybeSingle(),
    db.from("workspace_memberships").select("user_id").eq("workspace_id", task.workspace_id),
    db.from("checklist_items").select("id,content,completed_at,position").eq("task_id", taskId).order("position").order("created_at"),
    db.from("requirements").select("id,title,priority,status").eq("project_id", id).order("created_at"),
    db.from("task_requirements").select("requirement_id").eq("task_id", taskId),
    db.from("project_comments").select("id,author_id,content,created_at").eq("task_id", taskId).order("created_at"),
  ]);
  if (!projectResponse.data || !membershipResponse.data) notFound();
  const canEdit = ["owner", "admin", "editor"].includes(membershipResponse.data.role);
  const members = membersResponse.data ?? [];
  const ids = [...new Set([...members.map((member) => member.user_id), ...(commentsResponse.data ?? []).map((comment) => comment.author_id)])];
  const { data: profiles } = ids.length ? await db.from("profiles").select("id,display_name").in("id", ids) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const checklist = checklistResponse.data ?? [];
  const completed = checklist.filter((item) => !!item.completed_at).length;
  const percentage = checklist.length ? Math.round(completed / checklist.length * 100) : 0;
  const linked = new Set((linksResponse.data ?? []).map((link) => link.requirement_id));
  const requirements = requirementsResponse.data ?? [];
  const comments = commentsResponse.data ?? [];
  const hasError = membersResponse.error || checklistResponse.error || requirementsResponse.error || linksResponse.error || commentsResponse.error;

  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8"><Brand /><Link href={`/projects/${id}?view=tasks`} className="mt-9 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a {projectResponse.data.title}</Link><div className="mt-9 flex flex-wrap items-start justify-between gap-4"><div><Badge className="mb-4 border-0 bg-pastel-sky px-4 py-2 text-foreground">{task.status === "archived" ? "Archivada" : label(taskStatuses, task.status)}</Badge><h1 className="text-[2.35rem] leading-[1.12] font-bold tracking-[-0.045em]">{task.title}</h1><p className="mt-3 text-base leading-relaxed text-muted-foreground">{task.assignee_id ? names.get(task.assignee_id) || "Miembro anterior" : "Sin asignar"} · prioridad {label(taskPriorities, task.priority).toLowerCase()}{taskDates(task.start_date, task.due_date)}</p></div>{canEdit && <form action={setTaskStatus}><input type="hidden" name="project_id" value={id} /><input type="hidden" name="task_id" value={taskId} /><input type="hidden" name="status" value={task.status === "archived" ? "todo" : "archived"} /><Button type="submit" variant="outline">{task.status === "archived" ? <RotateCcw aria-hidden /> : <Archive aria-hidden />}{task.status === "archived" ? "Restaurar" : "Archivar"}</Button></form>}</div>
    {hasError && <p role="alert" className="mt-5 text-sm text-destructive">Algunos datos no se pudieron cargar. Actualiza la página.</p>}
    <div className="mt-7 grid gap-6 lg:grid-cols-[1.4fr_1fr]"><div className="flex flex-col gap-6"><Card><CardHeader><CardTitle>Descripción</CardTitle><CardDescription>Creada el {date(task.created_at)}</CardDescription></CardHeader><CardContent><p className="whitespace-pre-wrap text-base leading-7">{task.description || "Sin descripción todavía."}</p></CardContent></Card><Card><CardHeader><div className="flex items-center gap-2"><CheckCircle2 className="size-5" aria-hidden /><CardTitle>Checklist</CardTitle></div><CardDescription>{completed} de {checklist.length} pasos completados</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><Progress value={percentage} />{checklist.length ? <div className="flex flex-col gap-3">{checklist.map((item) => <div key={item.id} className="rounded-2xl border border-border/70 p-3">{canEdit ? <ChecklistToggle key={String(item.completed_at)} projectId={id} taskId={taskId} itemId={item.id} checked={!!item.completed_at} content={item.content} /> : <p className="text-sm">{item.completed_at ? "✓" : "○"} {item.content}</p>}</div>)}</div> : <p className="text-sm text-muted-foreground">Añade pasos pequeños para seguir el avance de la tarea.</p>}{canEdit && <ChecklistAddForm projectId={id} taskId={taskId} />}</CardContent></Card><Card><CardHeader><div className="flex items-center gap-2"><MessageCircle className="size-5" aria-hidden /><CardTitle>Conversación</CardTitle></div><CardDescription>Contexto y avances de esta tarea.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">{comments.map((comment) => <article key={comment.id} className="rounded-2xl bg-muted p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><strong className="text-foreground">{names.get(comment.author_id) || "Miembro anterior"}</strong><time dateTime={comment.created_at}>{date(comment.created_at)}</time></div><p className="whitespace-pre-wrap text-sm">{comment.content}</p></article>)}{!comments.length && <p className="text-sm text-muted-foreground">Aún no hay comentarios.</p>}{canEdit && <CommentForm projectId={id} targetId={taskId} targetType="task" />}</CardContent></Card></div><div className="flex flex-col gap-6">{canEdit && <Card><CardHeader><CardTitle>Editar tarea</CardTitle><CardDescription>Estado, responsable y rango de fechas.</CardDescription></CardHeader><CardContent><TaskForm projectId={id} members={members.map((member) => ({ user_id: member.user_id, name: names.get(member.user_id) || "Miembro" }))} task={{ id: task.id, title: task.title, description: task.description, status: task.status, priority: task.priority, assignee_id: task.assignee_id, start_date: task.start_date, due_date: task.due_date }} /></CardContent></Card>}<Card><CardHeader><div className="flex items-center gap-2"><Link2 className="size-5" aria-hidden /><CardTitle>Requisitos relacionados</CardTitle></div><CardDescription>Conecta la tarea con lo que debe cumplir el producto.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{requirements.filter((item) => item.status === "active").map((requirement) => <div key={requirement.id} className="rounded-2xl border border-border/70 p-3"><Link href={`/projects/${id}/requirements/${requirement.id}`} className="text-sm font-medium hover:text-primary">{requirement.title}</Link><p className="mt-1 text-xs text-muted-foreground">{label(requirementPriorities, requirement.priority)}</p>{canEdit && <form action={toggleRequirementLink} className="mt-3"><input type="hidden" name="project_id" value={id} /><input type="hidden" name="task_id" value={taskId} /><input type="hidden" name="requirement_id" value={requirement.id} /><input type="hidden" name="operation" value={linked.has(requirement.id) ? "remove" : "add"} /><Button type="submit" size="sm" variant="outline">{linked.has(requirement.id) ? "Desvincular" : "Vincular"}</Button></form>}{!canEdit && linked.has(requirement.id) && <Badge variant="secondary" className="mt-2">Vinculado</Badge>}</div>)}{!requirements.some((item) => item.status === "active") && <p className="text-sm text-muted-foreground">No hay requisitos activos en este proyecto.</p>}</CardContent></Card></div></div>
  </main>;
}
