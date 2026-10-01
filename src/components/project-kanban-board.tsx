"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setTaskStatus } from "@/app/projects/actions";
import { EditTaskDialog } from "@/components/task-card-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { taskPriorities, taskStatuses } from "@/lib/project-model";
import { cn } from "cn";
import { Check, CircleHelp, Flag, GitBranch, GitPullRequest, Link2, ListChecks, Plus, Search, Users } from "lucide-react";

type BoardTask = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  position: number;
  canMove: boolean;
  checklistTotal: number;
  checklistCompleted: number;
  requirements: { id: string; title: string }[];
  branch: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
};
type Person = { user_id: string; name: string; role: string };
type MemberOption = { user_id: string; name: string };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
const priorityTone: Record<string, string> = {
  high: "border-0 bg-pastel-peach text-foreground",
  medium: "border-0 bg-pastel-lavender text-foreground",
  low: "border-0 bg-pastel-sky text-foreground",
};
const columnTone = [
  { dot: "bg-muted-foreground", surface: "bg-muted/35", count: "bg-muted" },
  { dot: "bg-primary", surface: "bg-pastel-lavender/35", count: "bg-pastel-lavender" },
  { dot: "bg-emerald-600", surface: "bg-pastel-mint/40", count: "bg-pastel-mint" },
];

export function ProjectKanbanBoard({
  projectId,
  initialTasks,
  members,
  memberOptions,
  taskMembers,
  roleLabels,
  canEdit,
}: {
  projectId: string;
  initialTasks: BoardTask[];
  members: Person[];
  memberOptions: MemberOption[];
  taskMembers: MemberOption[];
  roleLabels: Record<string, string>;
  canEdit: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [requirementFilter, setRequirementFilter] = useState("all");
  const [hasPullRequest, setHasPullRequest] = useState(false);
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const requirements = Array.from(new Map(tasks.flatMap((task) => task.requirements).map((item) => [item.id, item])).values());
  const filteredTasks = tasks.filter((task) => {
    const query = search.trim().toLocaleLowerCase();
    return (!query || `${task.title} ${task.description} ${task.requirements.map((item) => item.title).join(" ")}`.toLocaleLowerCase().includes(query))
      && (assigneeFilter === "all" || (assigneeFilter === "unassigned" ? !task.assignee_id : task.assignee_id === assigneeFilter))
      && (priorityFilter === "all" || task.priority === priorityFilter)
      && (requirementFilter === "all" || task.requirements.some((requirement) => requirement.id === requirementFilter))
      && (!hasPullRequest || task.pullRequestNumber !== null);
  });

  function changeStatus(task: BoardTask, status: string) {
    if (!task.canMove || task.status === status || isPending) return;
    const oldStatus = task.status;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status } : item));
    setDraggedTask(null);
    setDropStatus(null);
    const form = new FormData();
    form.set("project_id", projectId);
    form.set("task_id", task.id);
    form.set("status", status);
    form.set("return_to", "inline");
    startTransition(async () => {
      try {
        await setTaskStatus(form);
        toast.success(`Tarea movida a ${taskStatuses.find((item) => item.value === status)?.label ?? status}.`);
      } catch {
        setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: oldStatus } : item));
        toast.error("No se pudo mover la tarea. Revisa tus permisos e inténtalo de nuevo.");
      }
    });
  }

  function handleCardKeyDown(event: React.KeyboardEvent<HTMLElement>, task: BoardTask) {
    if (!task.canMove || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const index = taskStatuses.findIndex((item) => item.value === task.status);
    const destination = taskStatuses[index + (event.key === "ArrowRight" ? 1 : -1)];
    if (!destination) return;
    event.preventDefault();
    changeStatus(task, destination.value);
  }

  const assignedCount = tasks.filter((task) => task.assignee_id).length;
  const assignedPercent = tasks.length ? Math.round(assignedCount / tasks.length * 100) : 0;

  return <div className="mt-6">
    <div className="mb-3 rounded-[1.5rem] bg-pastel-lavender/50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar por tarea o requisito…" aria-label="Filtrar por tarea o requisito" className="h-10 rounded-full border-0 bg-card pl-9 text-sm shadow-sm" />
        </label>
        <FilterSelect label="Responsable" value={assigneeFilter} onChange={setAssigneeFilter} options={[{ value: "all", label: "Cualquier responsable" }, { value: "unassigned", label: "Sin asignar" }, ...memberOptions.map((member) => ({ value: member.user_id, label: member.name }))]} />
        <FilterSelect label="Prioridad" value={priorityFilter} onChange={setPriorityFilter} options={[{ value: "all", label: "Cualquier prioridad" }, ...taskPriorities.map((item) => ({ value: item.value, label: item.label }))]} />
        <FilterSelect label="Requisito" value={requirementFilter} onChange={setRequirementFilter} options={[{ value: "all", label: "Cualquier requisito" }, ...requirements.map((item) => ({ value: item.id, label: item.title }))]} />
        <Button type="button" variant={hasPullRequest ? "default" : "outline"} size="sm" className="rounded-full bg-card" onClick={() => setHasPullRequest((current) => !current)} aria-pressed={hasPullRequest}>
          <GitPullRequest aria-hidden /> Con PR vinculado <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px]">{tasks.filter((task) => task.pullRequestNumber !== null).length}</span>
        </Button>
        <div className="ml-auto">{canEdit && <Button render={<Link href={`/projects/${projectId}/tasks/new`} />} className="rounded-full"><Plus aria-hidden /> Nueva tarea</Button>}</div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-primary/10 pt-3 text-xs text-muted-foreground">
        <Check className="size-4 text-emerald-700" aria-hidden />
        <span>Arrastra tarjetas entre columnas para actualizar su estado; también puedes usar ← y → al enfocar una tarjeta.</span>
        {isPending && <span className="ml-auto text-primary">Guardando…</span>}
      </div>
    </div>

    <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        {taskStatuses.map((column, index) => {
          const columnTasks = filteredTasks.filter((task) => task.status === column.value).sort((a, b) => a.position - b.position);
          const tone = columnTone[index];
          return <section key={column.value} aria-label={`${column.label}, ${columnTasks.length} tareas`} onDragOver={(event) => { event.preventDefault(); setDropStatus(column.value); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropStatus(null); }} onDrop={(event) => { event.preventDefault(); const task = tasks.find((item) => item.id === (event.dataTransfer.getData("text/plain") || draggedTask)); if (task) changeStatus(task, column.value); }} className={cn("min-h-[32rem] rounded-[1.5rem] p-3 transition-colors sm:p-4", tone.surface, dropStatus === column.value && "bg-primary/10 ring-2 ring-primary/35")}>
            <header className="mb-4 flex items-center justify-between gap-3 px-1">
              <h3 className="flex items-center gap-2.5 font-semibold tracking-tight"><span className={cn("size-2.5 rounded-full", tone.dot)} />{column.label}<Badge variant="secondary" className={cn("rounded-full px-2", tone.count)}>{columnTasks.length}</Badge></h3>
              {canEdit && <Button render={<Link href={`/projects/${projectId}/tasks/new`} />} variant="ghost" size="icon-sm" aria-label={`Crear tarea en ${column.label}`}><Plus aria-hidden /></Button>}
            </header>
            <div className="flex min-h-24 flex-col gap-3">
              {columnTasks.map((task) => {
                const assignee = memberOptions.find((member) => member.user_id === task.assignee_id);
                const percent = task.checklistTotal ? Math.round(task.checklistCompleted / task.checklistTotal * 100) : 0;
                return <Card key={task.id} size="sm" draggable={task.canMove} onDragStart={(event) => { if (!task.canMove) { event.preventDefault(); return; } setDraggedTask(task.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); }} onDragEnd={() => { setDraggedTask(null); setDropStatus(null); }} onKeyDown={(event) => handleCardKeyDown(event, task)} tabIndex={task.canMove ? 0 : undefined} aria-roledescription={task.canMove ? "tarjeta arrastrable" : undefined} aria-label={task.canMove ? `${task.title}. Usa las flechas izquierda y derecha para cambiar de columna.` : undefined} className={cn("group border-0 bg-card shadow-[0_2px_4px_rgb(32_37_70/0.06),0_8px_22px_rgb(32_37_70/0.06)] transition-[transform,box-shadow,opacity] hover:-translate-y-0.5 hover:shadow-[0_5px_10px_rgb(32_37_70/0.08),0_14px_32px_rgb(32_37_70/0.1)] focus-visible:ring-2 focus-visible:ring-primary", task.canMove && "cursor-grab active:cursor-grabbing", draggedTask === task.id && "scale-[0.98] opacity-45")}>
                  <CardHeader className="gap-3 pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {task.requirements.slice(0, 2).map((requirement) => <Badge key={requirement.id} variant="secondary" className="max-w-full rounded-full bg-pastel-lavender px-2.5 text-[10px] font-medium text-foreground"><Link2 aria-hidden /> <span className="truncate">Vinculado a {requirement.title}</span></Badge>)}
                        {!task.requirements.length && <Badge variant="outline" className="rounded-full text-[10px]">Sin requisito</Badge>}
                      </div>
                      <Badge className={cn("shrink-0 rounded-full px-2.5 text-[10px] font-semibold", priorityTone[task.priority])}>{taskPriorities.find((item) => item.value === task.priority)?.label ?? task.priority}</Badge>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <Checkbox checked={task.status === "done"} disabled={!task.canMove || isPending} onCheckedChange={() => changeStatus(task, task.status === "done" ? "todo" : "done")} aria-label={task.status === "done" ? `Reabrir ${task.title}` : `Completar ${task.title}`} className="mt-0.5 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <CardTitle data-task-title className={cn("text-[15px] leading-5 tracking-[-0.02em]", task.status === "done" && "text-muted-foreground line-through decoration-2")}><Link href={`/projects/${projectId}/tasks/${task.id}`} className="hover:text-primary">{task.title}</Link></CardTitle>
                        {task.description && <CardDescription className="mt-2 line-clamp-3 text-xs leading-[1.55]">{task.description}</CardDescription>}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-1">
                    {task.pullRequestNumber !== null && <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-700/15 bg-pastel-mint/65 p-2.5 text-xs">
                      <GitPullRequest className="size-4 text-emerald-800" aria-hidden /><span className="font-semibold text-emerald-900">PR #{task.pullRequestNumber}</span><span className="text-muted-foreground">vinculado</span>
                      {task.pullRequestUrl && <a href={task.pullRequestUrl} target="_blank" rel="noreferrer" className="ml-auto text-primary underline-offset-2 hover:underline">Abrir</a>}
                    </div>}
                    {task.branch && <div className="mb-3 flex min-w-0 items-center gap-2 rounded-xl bg-muted/70 px-2.5 py-2 text-[10px] text-muted-foreground"><GitBranch className="size-3.5 shrink-0" aria-hidden /><span className="truncate font-mono">{task.branch}</span></div>}
                    {task.checklistTotal > 0 && <div className="mb-3 rounded-xl bg-muted/55 px-2.5 py-2"><div className="mb-1.5 flex items-center justify-between text-[10px] text-muted-foreground"><span className="flex items-center gap-1.5"><ListChecks className="size-3.5" aria-hidden />Checklist {task.checklistCompleted}/{task.checklistTotal}</span><span>{percent}%</span></div><Progress value={percent} className="h-1.5" /></div>}
                    <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                      {assignee ? <div className="flex min-w-0 items-center gap-2"><Avatar className="size-7 ring-2 ring-card"><AvatarFallback className="bg-pastel-lavender text-[10px]">{initials(assignee.name)}</AvatarFallback></Avatar><span className="truncate text-xs text-muted-foreground">{assignee.name}</span></div> : <span className="text-xs text-muted-foreground">Sin asignar</span>}
                      {canEdit && <EditTaskDialog projectId={projectId} task={task} members={taskMembers} />}
                    </div>
                  </CardContent>
                </Card>;
              })}
              {!columnTasks.length && <div className={cn("flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-border/75 bg-card/45 p-5 text-center text-xs text-muted-foreground", dropStatus === column.value && "border-primary/50 bg-primary/5 text-primary")}>{dropStatus === column.value ? "Suelta aquí para cambiar de etapa" : filteredTasks.length ? "No hay tareas que coincidan" : "Suelta una tarea aquí o ajusta los filtros"}</div>}
            </div>
          </section>;
        })}
      </div>

      <aside className="flex flex-col gap-4 rounded-[1.5rem] border border-border/70 bg-card p-4 shadow-[0_8px_28px_rgb(45_43_91/0.05)] 2xl:sticky 2xl:top-24">
        <div className="flex items-center gap-2"><Users className="size-4 text-primary" aria-hidden /><div><p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Equipo del proyecto</p><h3 className="font-semibold">Equipo &amp; Roles</h3></div><Badge variant="secondary" className="ml-auto rounded-full">{members.length}</Badge></div>
        <div className="rounded-2xl bg-pastel-lavender/55 p-3"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">Cuota de asignación</span><span className="font-semibold text-primary">{assignedCount} tareas asignadas</span></div><Progress value={assignedPercent} className="h-1.5" /><p className="mt-2 text-[10px] text-muted-foreground">{assignedPercent}% del trabajo tiene responsable</p></div>
        <div><h4 className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Miembros con acceso</h4><div className="flex flex-col gap-2">
          {members.slice(0, 8).map((member) => <div key={member.user_id} className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-muted/45 p-2.5">
            <Avatar className="size-9"><AvatarFallback className="bg-pastel-sky text-xs">{initials(member.name)}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{member.name}</p><p className="truncate text-[10px] text-muted-foreground">{tasks.filter((task) => task.assignee_id === member.user_id).length} tareas asignadas</p></div>
            <Badge variant="secondary" className="shrink-0 rounded-full px-2 text-[9px]">{roleLabels[member.role] ?? member.role}</Badge>
          </div>)}
          {!members.length && <p className="rounded-xl bg-muted/45 p-3 text-xs text-muted-foreground">Aún no hay miembros disponibles.</p>}
        </div></div>
        {canEdit && <Button render={<Link href={`/projects/${projectId}?view=people`} />} variant="outline" className="mt-auto w-full rounded-full"><Users aria-hidden /> Gestionar equipo</Button>}
        <p className="flex items-start gap-2 text-[10px] leading-relaxed text-muted-foreground"><CircleHelp className="mt-0.5 size-3.5 shrink-0" aria-hidden />El cambio de columna queda guardado en el proyecto y actualiza sus automatizaciones configuradas.</p>
      </aside>
    </div>
  </div>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label className="flex h-10 max-w-52 items-center gap-1.5 rounded-full bg-card px-3 shadow-sm">
    <Flag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
    <span className="sr-only">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="min-w-0 bg-transparent text-xs outline-none">
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}
