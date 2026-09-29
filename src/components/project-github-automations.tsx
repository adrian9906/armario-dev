"use client";

import { useActionState, useEffect } from "react";
import { Activity, ArrowRight, Bot, GitBranch, GitPullRequest, RefreshCw, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  createTaskGitHubPullRequest,
  saveGitHubAutomationSettings,
  synchronizeGitHubTasks,
  type GitHubAutomationFormState,
} from "@/app/projects/github-automation-actions";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

type Settings = {
  task_issue_enabled: boolean;
  task_branch_enabled: boolean;
  task_pr_enabled: boolean;
  pr_merge_completes_task: boolean;
  issue_state_sync: boolean;
  document_publish_enabled: boolean;
  notifications_enabled: boolean;
  branch_prefix: string;
};

type TaskLink = {
  task_id: string;
  issue_number: number | null;
  issue_url: string | null;
  branch_name: string | null;
  pull_request_number: number | null;
  pull_request_url: string | null;
  pull_request_state: string | null;
  last_origin: string;
  last_event: string;
};

type Task = { id: string; title: string; status: string };
type Event = {
  id: string;
  origin: "armario" | "github";
  event: string;
  status: "running" | "completed" | "failed" | "ignored";
  summary: string;
  created_at: string;
};

const initial: GitHubAutomationFormState = { error: null, success: null };

function useResultToast(state: GitHubAutomationFormState) {
  useEffect(() => {
    if (state.success) toast.success(state.success, { description: "GitHub y Armario Dev quedaron sincronizados." });
    if (state.error) toast.error(state.error);
  }, [state]);
}

function SettingsForm({ projectId, settings }: { projectId: string; settings: Settings }) {
  const [state, action, pending] = useActionState(saveGitHubAutomationSettings, initial);
  useResultToast(state);
  const options = [
    { name: "task_issue_enabled", label: "Tarea → issue", description: "Crea y mantiene un issue por cada tarea.", checked: settings.task_issue_enabled },
    { name: "task_branch_enabled", label: "En curso → rama", description: "Crea una rama al mover una tarea a En curso.", checked: settings.task_branch_enabled },
    { name: "task_pr_enabled", label: "Tarea → pull request", description: "Permite abrir un PR desde la rama vinculada.", checked: settings.task_pr_enabled },
    { name: "issue_state_sync", label: "Estado del issue → tarea", description: "Cerrar o reabrir el issue actualiza la tarea.", checked: settings.issue_state_sync },
    { name: "pr_merge_completes_task", label: "Merge → tarea terminada", description: "Marca la tarea como hecha cuando GitHub fusiona su PR.", checked: settings.pr_merge_completes_task },
    { name: "document_publish_enabled", label: "Documentación automática", description: "Publica requisitos, ADR y diagramas al guardarlos.", checked: settings.document_publish_enabled },
    { name: "notifications_enabled", label: "Notificaciones GitHub", description: "Avisa a responsables y creadores de las tareas.", checked: settings.notifications_enabled },
  ];
  return <form action={action}>
    <FieldGroup>
      <input type="hidden" name="project_id" value={projectId} />
      <div className="grid gap-3 md:grid-cols-2">
        {options.map((option) => <Field key={option.name} orientation="horizontal" className="rounded-2xl border border-border/70 p-4">
          <Checkbox id={`automation-${option.name}`} name={option.name} defaultChecked={option.checked} />
          <FieldContent>
            <FieldLabel htmlFor={`automation-${option.name}`}>{option.label}</FieldLabel>
            <FieldDescription>{option.description}</FieldDescription>
          </FieldContent>
        </Field>)}
      </div>
      <Field>
        <FieldLabel htmlFor="automation-branch-prefix">Prefijo de ramas</FieldLabel>
        <Input id="automation-branch-prefix" name="branch_prefix" required maxLength={40} defaultValue={settings.branch_prefix} placeholder="task" />
        <FieldDescription>Ejemplo: task/12-autenticacion o feature/task/12-autenticacion.</FieldDescription>
      </Field>
      {state.error && <FieldError>{state.error}</FieldError>}
      <Button type="submit" disabled={pending}>{pending && <Spinner data-icon="inline-start" />}Guardar automatizaciones</Button>
    </FieldGroup>
  </form>;
}

function SynchronizeButton({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(synchronizeGitHubTasks, initial);
  useResultToast(state);
  return <form action={action}>
    <input type="hidden" name="project_id" value={projectId} />
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
      {pending ? "Sincronizando…" : "Sincronizar ahora"}
    </Button>
  </form>;
}

function PullRequestButton({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [state, action, pending] = useActionState(createTaskGitHubPullRequest, initial);
  useResultToast(state);
  return <form action={action}>
    <input type="hidden" name="project_id" value={projectId} />
    <input type="hidden" name="task_id" value={taskId} />
    <Button type="submit" size="sm" variant="outline" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : <GitPullRequest data-icon="inline-start" />}
      {pending ? "Creando…" : "Crear PR"}
    </Button>
  </form>;
}

const stateLabel = (status: string) => status === "done" ? "Terminada" : status === "in_progress" ? "En curso" : status === "archived" ? "Archivada" : "Pendiente";
const eventLabel = (status: Event["status"]) => status === "completed" ? "Completado" : status === "failed" ? "Error" : status === "running" ? "En curso" : "Omitido";

export function ProjectGitHubAutomations({ projectId, canManage, webhookConfigured, settings, tasks, links, events }: {
  projectId: string;
  canManage: boolean;
  webhookConfigured: boolean;
  settings: Settings;
  tasks: Task[];
  links: TaskLink[];
  events: Event[];
}) {
  const linksByTask = new Map(links.map((link) => [link.task_id, link]));
  const activeRules = [
    settings.task_issue_enabled,
    settings.task_branch_enabled,
    settings.task_pr_enabled,
    settings.pr_merge_completes_task,
    settings.issue_state_sync,
    settings.document_publish_enabled,
  ].filter(Boolean).length;
  return <Card className="overflow-hidden">
    <CardHeader className="border-b bg-pastel-lavender/35">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-card"><Bot aria-hidden /></span>
          <div><CardTitle>Automatizaciones de Armario Dev</CardTitle><CardDescription>El trabajo del proyecto y GitHub avanzan juntos sin repetir eventos.</CardDescription></div>
        </div>
        <div className="flex items-center gap-2"><Badge variant="secondary">{activeRules} reglas activas</Badge>{canManage && <SynchronizeButton projectId={projectId} />}</div>
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-7">
      {!webhookConfigured && <Alert><TriangleAlert aria-hidden /><AlertTitle>Falta activar el webhook</AlertTitle><AlertDescription>Las acciones Armario → GitHub funcionan, pero los cierres de issues y merges no volverán a Armario Dev hasta configurar una URL pública y el secreto del webhook.</AlertDescription></Alert>}
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
        <div className="rounded-2xl border p-4"><Sparkles className="mb-3" aria-hidden /><p className="font-semibold">Tarea</p><p className="text-sm text-muted-foreground">Título, estado y contexto.</p></div>
        <ArrowRight className="hidden text-muted-foreground md:block" aria-hidden />
        <div className="rounded-2xl border p-4"><GitBranch className="mb-3" aria-hidden /><p className="font-semibold">Issue y rama</p><p className="text-sm text-muted-foreground">Trazabilidad del trabajo.</p></div>
        <ArrowRight className="hidden text-muted-foreground md:block" aria-hidden />
        <div className="rounded-2xl border p-4"><GitPullRequest className="mb-3" aria-hidden /><p className="font-semibold">Pull request</p><p className="text-sm text-muted-foreground">El merge termina la tarea.</p></div>
      </div>

      {canManage ? <SettingsForm projectId={projectId} settings={settings} /> : <p className="text-sm text-muted-foreground">Solo la administración del proyecto puede cambiar estas reglas.</p>}

      <section aria-labelledby="github-task-links-title">
        <div className="mb-3 flex items-center justify-between gap-3"><h3 id="github-task-links-title" className="font-heading font-bold">Tareas conectadas</h3><Badge variant="outline">{links.length}</Badge></div>
        <div className="grid gap-3 md:grid-cols-2">
          {tasks.map((task) => {
            const link = linksByTask.get(task.id);
            if (!link) return null;
            return <article key={task.id} className="rounded-2xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{task.title}</p><p className="text-xs text-muted-foreground">{stateLabel(task.status)}</p></div><Badge variant="secondary">{link.last_origin === "github" ? "Desde GitHub" : "Desde Armario"}</Badge></div>
              <div className="mt-4 flex flex-wrap gap-2">
                {link.issue_url && <Button size="sm" variant="outline" render={<a href={link.issue_url} target="_blank" rel="noreferrer" />}>Issue #{link.issue_number}</Button>}
                {link.branch_name && <Badge variant="outline"><GitBranch aria-hidden />{link.branch_name}</Badge>}
                {link.pull_request_url ? <Button size="sm" variant="outline" render={<a href={link.pull_request_url} target="_blank" rel="noreferrer" />}>PR #{link.pull_request_number}</Button> : canManage && settings.task_pr_enabled && link.branch_name ? <PullRequestButton projectId={projectId} taskId={task.id} /> : null}
              </div>
            </article>;
          })}
          {!links.length && <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground md:col-span-2">Aún no hay tareas conectadas. Activa una regla y ejecuta “Sincronizar ahora”.</p>}
        </div>
      </section>

      <section aria-labelledby="github-automation-activity-title">
        <div className="mb-3 flex items-center gap-2"><Activity aria-hidden /><h3 id="github-automation-activity-title" className="font-heading font-bold">Actividad automática</h3></div>
        <div className="flex flex-col gap-3">
          {events.map((event) => <article key={event.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/70 p-4">
            <div><p className="text-sm font-medium">{event.summary}</p><p className="mt-1 text-xs text-muted-foreground">{event.origin === "github" ? "GitHub" : "Armario Dev"} · {new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</p></div>
            <Badge variant={event.status === "failed" ? "destructive" : event.status === "completed" ? "default" : "secondary"}>{eventLabel(event.status)}</Badge>
          </article>)}
          {!events.length && <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Los eventos automáticos aparecerán aquí.</p>}
        </div>
      </section>
    </CardContent>
    <CardFooter><p className="text-xs text-muted-foreground">Los eventos incluyen origen y versión remota para evitar sincronizaciones en bucle.</p></CardFooter>
  </Card>;
}
