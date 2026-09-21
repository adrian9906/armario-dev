import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, ClipboardList, MessageCircle, RotateCcw } from "lucide-react";
import { setRequirementArchived } from "@/app/projects/actions";
import { CommentForm, RequirementForm } from "@/components/project-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requirementCoverage, requirementKinds, requirementPriorities, taskStatuses } from "@/lib/project-model";
import { requireProjectAccess } from "@/lib/project-access";

export const dynamic = "force-dynamic";
const label = (choices: readonly { value: string; label: string }[], value: string) => choices.find((item) => item.value === value)?.label ?? value;
const date = (value: string) => new Intl.DateTimeFormat("es", { dateStyle: "medium" }).format(new Date(value));

export default async function RequirementPage({ params }: { params: Promise<{ id: string; requirementId: string }> }) {
  const { id, requirementId } = await params;
  const { db, canEdit, canComment } = await requireProjectAccess(id);
  const { data: requirement } = await db.from("requirements")
    .select("id,project_id,workspace_id,title,description,acceptance_criteria,kind,priority,status,created_at")
    .eq("id", requirementId).eq("project_id", id).maybeSingle();
  if (!requirement) notFound();
  const [projectResponse, linksResponse, tasksResponse, commentsResponse] = await Promise.all([
    db.from("projects").select("title").eq("id", id).eq("workspace_id", requirement.workspace_id).maybeSingle(),
    db.from("task_requirements").select("task_id,requirement_id").eq("requirement_id", requirementId),
    db.from("tasks").select("id,title,status").eq("project_id", id),
    db.from("project_comments").select("id,author_id,content,created_at").eq("requirement_id", requirementId).order("created_at"),
  ]);
  if (!projectResponse.data) notFound();
  const links = linksResponse.data ?? [];
  const tasks = tasksResponse.data ?? [];
  const coverage = requirementCoverage(requirementId, links, tasks);
  const linkedTasks = tasks.filter((task) => links.some((link) => link.task_id === task.id) && task.status !== "archived");
  const comments = commentsResponse.data ?? [];
  const authorIds = [...new Set(comments.map((comment) => comment.author_id))];
  const { data: profiles } = authorIds.length ? await db.from("profiles").select("id,display_name").in("id", authorIds) : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
  const hasError = linksResponse.error || tasksResponse.error || commentsResponse.error;

  return <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:py-12"><Link href={`/projects/${id}?view=requirements`} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a los requisitos de {projectResponse.data.title}</Link><div className="mt-9 flex flex-wrap items-start justify-between gap-4"><div><Badge className="mb-4 border-0 bg-pastel-peach px-4 py-2 text-foreground">{requirement.status === "archived" ? "Archivado" : label(requirementKinds, requirement.kind)}</Badge><h1 className="text-[2.35rem] leading-[1.12] font-bold tracking-[-0.045em]">{requirement.title}</h1><p className="mt-3 text-base leading-relaxed text-muted-foreground">{label(requirementPriorities, requirement.priority)} · creado el {date(requirement.created_at)}</p></div>{canEdit && <form action={setRequirementArchived}><input type="hidden" name="project_id" value={id} /><input type="hidden" name="requirement_id" value={requirementId} /><input type="hidden" name="status" value={requirement.status === "archived" ? "active" : "archived"} /><Button type="submit" variant="outline">{requirement.status === "archived" ? <RotateCcw aria-hidden /> : <Archive aria-hidden />}{requirement.status === "archived" ? "Restaurar" : "Archivar"}</Button></form>}</div>
    {hasError && <p role="alert" className="mt-5 text-sm text-destructive">Algunos datos no se pudieron cargar. Actualiza la página.</p>}
    <div className="mt-7 grid gap-6 lg:grid-cols-[1.4fr_1fr]"><div className="flex flex-col gap-6"><Card><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-mint"><ClipboardList aria-hidden /></div><CardTitle>Definición</CardTitle></CardHeader><CardContent className="flex flex-col gap-6"><div><h2 className="mb-2 text-sm font-semibold">Descripción</h2><p className="whitespace-pre-wrap text-base leading-7">{requirement.description || "Sin descripción adicional."}</p></div><div><h2 className="mb-2 text-sm font-semibold">Criterios de aceptación</h2><p className="whitespace-pre-wrap text-base leading-7">{requirement.acceptance_criteria || "Aún no se han definido criterios."}</p></div></CardContent></Card><Card><CardHeader><div className="flex items-center gap-2"><MessageCircle className="size-5" aria-hidden /><CardTitle>Comentarios</CardTitle></div><CardDescription>Decisiones y aclaraciones sobre este requisito.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">{comments.map((comment) => <article key={comment.id} className="rounded-2xl bg-muted p-4"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><strong className="text-foreground">{names.get(comment.author_id) || "Miembro anterior"}</strong><time dateTime={comment.created_at}>{date(comment.created_at)}</time></div><p className="whitespace-pre-wrap text-sm">{comment.content}</p></article>)}{!comments.length && <p className="text-sm text-muted-foreground">Aún no hay comentarios.</p>}{canComment && <CommentForm projectId={id} targetId={requirementId} targetType="requirement" />}</CardContent></Card></div><div className="flex flex-col gap-6"><Card className="border-0 bg-pastel-sky/70"><CardHeader><CardTitle>Cobertura</CardTitle><CardDescription>{coverage.total ? `${coverage.completed} de ${coverage.total} tareas vinculadas terminadas` : "Sin tareas vinculadas"}</CardDescription></CardHeader><CardContent className="flex items-center gap-3"><Progress value={coverage.percent} className="flex-1" /><span className="text-sm font-semibold">{coverage.percent}%</span></CardContent></Card><Card><CardHeader><CardTitle>Tareas relacionadas</CardTitle><CardDescription>La cobertura se calcula con las tareas activas vinculadas.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{linkedTasks.map((task) => <Link key={task.id} href={`/projects/${id}/tasks/${task.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 p-3 text-sm hover:bg-accent"><span>{task.title}</span><Badge variant="outline">{label(taskStatuses, task.status)}</Badge></Link>)}{!linkedTasks.length && <p className="text-sm text-muted-foreground">Abre una tarea para vincularla con este requisito.</p>}</CardContent></Card>{canEdit && <Card><CardHeader><CardTitle>Editar requisito</CardTitle></CardHeader><CardContent><RequirementForm projectId={id} requirement={{ id: requirement.id, title: requirement.title, description: requirement.description, acceptance_criteria: requirement.acceptance_criteria, kind: requirement.kind, priority: requirement.priority }} /></CardContent></Card>}</div></div>
  </main>;
}
