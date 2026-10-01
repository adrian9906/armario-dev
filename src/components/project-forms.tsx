"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { TaskDateRange } from "@/components/task-date-range";
import { addChecklistItem, addComment, convertIdea, createRequirement, createTask, updateProject, updateRequirement, updateTask } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { moduleOptions, projectKinds, projectStages, requirementKinds, requirementPriorities, taskPriorities, type ProjectModules } from "@/lib/project-model";
import { Badge } from "@/components/ui/badge";
import { Check, CheckCheck, Code2, FolderOpen, Globe2, Layers3, Network, Rocket, Server, Smartphone, UserRound } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

const initial = { error: null, success: null };
type Choice = { value: string; label: string };

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Guardando…" : children}</Button>;
}

function ChoiceSelect({ id, name, label, options, defaultValue }: { id: string; name: string; label: string; options: readonly Choice[]; defaultValue: string }) {
  return <Field><FieldLabel htmlFor={id}>{label}</FieldLabel><Select name={name} defaultValue={defaultValue} items={options}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>;
}

function ModuleFields({ selected }: { selected?: Partial<ProjectModules> }) {
  return <FieldSet><FieldLegend variant="label">Módulos del proyecto</FieldLegend><FieldDescription>Activa las partes que vas a construir. Podrás cambiarlas después.</FieldDescription><div className="mt-3 grid gap-3 sm:grid-cols-2">{moduleOptions.map((option) => <Field key={option.value} orientation="horizontal" className="rounded-2xl border border-border bg-background p-4"><Checkbox id={`module-${option.value}`} name="modules" value={option.value} defaultChecked={selected?.[option.value] ?? false} /><div className="flex flex-col gap-0.5"><FieldLabel htmlFor={`module-${option.value}`}>{option.label}</FieldLabel><FieldDescription>{option.description}</FieldDescription></div></Field>)}</div></FieldSet>;
}

const conversionTypes = [
  { value: "web", label: "Web", caption: "SPA / SaaS", icon: Globe2 },
  { value: "mobile", label: "Móvil", caption: "iOS / Android", icon: Smartphone },
  { value: "frontend", label: "Frontend", caption: "Componentes", icon: Layers3 },
  { value: "backend", label: "Backend", caption: "APIs y servicios", icon: Server },
  { value: "mixed", label: "Mixto", caption: "Fullstack / IA", icon: Network },
] as const;

const recommendedModules = (kind: string): ProjectModules => ({
  frontend: ["web", "frontend", "mixed", "mobile"].includes(kind),
  backend: ["web", "backend", "mixed"].includes(kind),
  database: false,
  auth: false,
});

function ConvertProjectSubmit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>
    {pending ? <><Spinner data-icon="inline-start" /> Creando proyecto…</> : <><CheckCheck data-icon="inline-start" aria-hidden /> Confirmar y crear proyecto</>}
  </Button>;
}

export function ConvertIdeaForm({ ideaId, ideaDescription, suggestedKind, workspaceName, leaderName, onCancel }: {
  ideaId: string;
  ideaDescription: string;
  suggestedKind: string | null;
  workspaceName: string;
  leaderName: string;
  onCancel?: () => void;
}) {
  const [state, action] = useActionState(convertIdea, initial);
  const initialKind = projectKinds.some((item) => item.value === suggestedKind) && suggestedKind !== "other" ? suggestedKind! : "web";
  const [kind, setKind] = useState(initialKind);
  const [modules, setModules] = useState<ProjectModules>(() => recommendedModules(initialKind));

  return <form action={action}>
    <FieldGroup className="gap-5">
      <input type="hidden" name="idea_id" value={ideaId} />
      <input type="hidden" name="kind" value={kind} />

      <FieldSet>
        <FieldLegend variant="label" className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">1. Tipo de proyecto arquitectural</FieldLegend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {conversionTypes.map(({ value, label, caption, icon: Icon }) => {
            const selected = kind === value;
            return <label key={value} className={`relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center transition-all ${selected ? "border-primary bg-primary/6 shadow-[0_5px_18px_color-mix(in_srgb,var(--primary)_12%,transparent)]" : "border-transparent bg-secondary/75 hover:border-border hover:bg-secondary"}`}>
              <input type="radio" name="convert-kind-choice" value={value} checked={selected} onChange={() => { setKind(value); setModules(recommendedModules(value)); }} className="sr-only" />
              <Icon className={`size-5 ${selected ? "text-primary" : "text-muted-foreground"}`} aria-hidden />
              <span className="text-sm font-semibold">{label}</span>
              <span className="text-xs text-muted-foreground">{caption}</span>
            </label>;
          })}
        </div>
      </FieldSet>

      <FieldSet>
        <FieldLegend variant="label" className="flex w-full flex-wrap items-center justify-between gap-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground"><span>2. Módulos y capacidades iniciales</span><span className="font-normal tracking-normal">Recomendados para {conversionTypes.find((item) => item.value === kind)?.label}</span></FieldLegend>
        <div className="grid gap-2 sm:grid-cols-2">
          {moduleOptions.map((option) => <Field key={option.value} orientation="horizontal" className={`min-h-20 rounded-2xl border p-3 transition-colors ${modules[option.value] ? "border-primary/15 bg-secondary/70" : "border-border/70 bg-background hover:bg-muted/45"}`}>
            <Checkbox id={`convert-module-${option.value}`} name="modules" value={option.value} checked={modules[option.value]} onCheckedChange={(checked) => setModules((current) => ({ ...current, [option.value]: checked === true }))} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <FieldLabel htmlFor={`convert-module-${option.value}`} className="font-medium">{option.label}</FieldLabel>
              <FieldDescription className="text-xs">{option.description}</FieldDescription>
            </div>
          </Field>)}
          <div className="flex min-h-20 items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/35 p-3 sm:col-span-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground"><Code2 className="size-4" aria-hidden /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-medium">Repositorio y Git Sync</p><p className="text-xs text-muted-foreground">Vincula GitHub desde el proyecto una vez creado.</p></div>
            <Badge variant="secondary" className="shrink-0">Después</Badge>
          </div>
        </div>
      </FieldSet>

      <Field>
        <FieldLabel htmlFor="convert-objective" className="text-xs font-semibold tracking-[0.08em] text-muted-foreground">3. Objetivo del proyecto</FieldLabel>
        <Textarea id="convert-objective" name="objective" defaultValue={ideaDescription} maxLength={10000} rows={3} placeholder="¿Qué resultado quieres conseguir?" className="min-h-24 rounded-2xl bg-secondary/60" />
      </Field>

      <div className="grid gap-2 rounded-2xl bg-secondary/65 p-3 sm:grid-cols-2">
        <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-primary"><FolderOpen className="size-4" aria-hidden /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">Espacio de destino</p><p className="truncate text-sm font-medium">{workspaceName}</p></div></div>
        <div className="flex min-w-0 items-center gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-primary"><UserRound className="size-4" aria-hidden /></span><div className="min-w-0"><p className="text-xs text-muted-foreground">Líder asignado</p><p className="truncate text-sm font-medium">{leaderName}</p></div></div>
      </div>

      <div className="flex items-center gap-2 border-t pt-4 text-sm text-muted-foreground"><Check className="size-4 shrink-0 text-primary" aria-hidden /> La idea original quedará vinculada permanentemente.</div>
      {state.error && <FieldError>{state.error}</FieldError>}
      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row sm:items-center sm:gap-4">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>}
        <ConvertProjectSubmit />
      </div>
    </FieldGroup>
  </form>;
}

export function ConvertIdeaDialog({ ideaId, ideaTitle, ideaDescription, suggestedKind, workspaceName, leaderName }: {
  ideaId: string;
  ideaTitle: string;
  ideaDescription: string;
  suggestedKind: string | null;
  workspaceName: string;
  leaderName: string;
}) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <Button onClick={() => setOpen(true)}><Rocket data-icon="inline-start" aria-hidden /> Convertir en proyecto</Button>
    <DialogContent className="max-h-[calc(100svh-2rem)] max-w-4xl gap-5 overflow-y-auto p-5 sm:p-8">
      <DialogHeader>
        <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary"><Rocket aria-hidden /></span>
        <DialogTitle className="mt-1">Transformar en Proyecto</DialogTitle>
        <DialogDescription className="-mt-1">Configura los cimientos estructurados de desarrollo para “{ideaTitle}”.</DialogDescription>
      </DialogHeader>
      <ConvertIdeaForm ideaId={ideaId} ideaDescription={ideaDescription} suggestedKind={suggestedKind} workspaceName={workspaceName} leaderName={leaderName} onCancel={() => setOpen(false)} />
    </DialogContent>
  </Dialog>;
}

type ProjectValues = { id: string; title: string; objective: string; kind: string; stage: string; modules: ProjectModules };
export function ProjectSettingsForm({ project }: { project: ProjectValues }) {
  const [state, action] = useActionState(updateProject, initial);
  return <form action={action}><FieldGroup><input type="hidden" name="project_id" value={project.id} /><Field><FieldLabel htmlFor="project-title">Nombre</FieldLabel><Input id="project-title" name="title" required maxLength={160} defaultValue={project.title} /></Field><Field><FieldLabel htmlFor="project-objective">Objetivo</FieldLabel><Textarea id="project-objective" name="objective" rows={5} maxLength={10000} defaultValue={project.objective} /></Field><div className="grid gap-5 sm:grid-cols-2"><ChoiceSelect id="project-kind" name="kind" label="Tipo" options={projectKinds} defaultValue={project.kind} /><ChoiceSelect id="project-stage" name="stage" label="Etapa" options={projectStages} defaultValue={project.stage} /></div><ModuleFields selected={project.modules} />{state.error && <FieldError>{state.error}</FieldError>}<Submit>Guardar proyecto</Submit></FieldGroup></form>;
}

type Member = { user_id: string; name: string };
export type TaskValues = { id: string; title: string; description: string; status: string; priority: string; assignee_id: string | null; start_date: string | null; due_date: string | null };
export function TaskForm({ projectId, members, task, presentation = "page", onSuccess }: { projectId: string; members: Member[]; task?: TaskValues; presentation?: "page" | "modal"; onSuccess?: () => void }) {
  const [state, action] = useActionState(task ? updateTask : createTask, initial);
  const assignees = [{ value: "unassigned", label: "Sin asignar" }, ...members.map((member) => ({ value: member.user_id, label: member.name }))];
  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    onSuccess?.();
  }, [onSuccess, state.success]);

  return <form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="status" value={task?.status === "archived" ? "todo" : task?.status ?? "todo"} /><input type="hidden" name="presentation" value={presentation} />{task && <input type="hidden" name="task_id" value={task.id} />}<Field><FieldLabel htmlFor="task-title">Título de la tarea</FieldLabel><Input id="task-title" name="title" required maxLength={160} defaultValue={task?.title} placeholder="¿Qué hay que hacer?" /></Field><Field><FieldLabel htmlFor="task-description">Descripción</FieldLabel><Textarea id="task-description" name="description" rows={4} maxLength={10000} defaultValue={task?.description} placeholder="Contexto o indicaciones para el equipo" /></Field><div className="grid gap-5 sm:grid-cols-2"><ChoiceSelect id="task-priority" name="priority" label="Prioridad" options={taskPriorities} defaultValue={task?.priority ?? "medium"} /><ChoiceSelect id="task-assignee" name="assignee_id" label="Responsable" options={assignees} defaultValue={task?.assignee_id ?? "unassigned"} /></div><TaskDateRange startDate={task?.start_date} dueDate={task?.due_date} />{!task && <Field><FieldLabel htmlFor="task-checklist">Checklist inicial</FieldLabel><FieldDescription>Escribe un paso por línea. Podrás añadir más después.</FieldDescription><Textarea id="task-checklist" name="checklist" rows={4} maxLength={9000} placeholder="Definir la pantalla principal" /></Field>}{state.error && <FieldError>{state.error}</FieldError>}<Submit>{task ? "Guardar tarea" : "Crear tarea"}</Submit></FieldGroup></form>;
}

type RequirementValues = { id: string; title: string; description: string; acceptance_criteria: string; kind: string; priority: string };
export function RequirementForm({ projectId, requirement }: { projectId: string; requirement?: RequirementValues }) {
  const [state, action] = useActionState(requirement ? updateRequirement : createRequirement, initial);
  return <form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} />{requirement && <input type="hidden" name="requirement_id" value={requirement.id} />}<Field><FieldLabel htmlFor="requirement-title">Título del requisito</FieldLabel><Input id="requirement-title" name="title" required maxLength={160} defaultValue={requirement?.title} placeholder="Qué debe permitir el producto" /></Field><Field><FieldLabel htmlFor="requirement-description">Descripción</FieldLabel><Textarea id="requirement-description" name="description" rows={4} maxLength={10000} defaultValue={requirement?.description} /></Field><Field><FieldLabel htmlFor="requirement-criteria">Criterios de aceptación</FieldLabel><Textarea id="requirement-criteria" name="acceptance_criteria" rows={4} maxLength={10000} defaultValue={requirement?.acceptance_criteria} placeholder="Cómo sabremos que está terminado" /></Field><div className="grid gap-5 sm:grid-cols-2"><ChoiceSelect id="requirement-kind" name="kind" label="Clase" options={requirementKinds} defaultValue={requirement?.kind ?? "functional"} /><ChoiceSelect id="requirement-priority" name="priority" label="Prioridad" options={requirementPriorities} defaultValue={requirement?.priority ?? "must"} /></div>{state.error && <FieldError>{state.error}</FieldError>}<Submit>{requirement ? "Guardar requisito" : "Crear requisito"}</Submit></FieldGroup></form>;
}

export function ChecklistAddForm({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [state, action] = useActionState(addChecklistItem, initial);
  return <form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="task_id" value={taskId} /><Field><FieldLabel htmlFor="checklist-content">Nuevo paso</FieldLabel><Input id="checklist-content" name="content" required maxLength={300} placeholder="Un paso pequeño y verificable" /></Field>{state.error && <FieldError>{state.error}</FieldError>}<Submit>Añadir al checklist</Submit></FieldGroup></form>;
}

export function CommentForm({ projectId, targetId, targetType }: { projectId: string; targetId: string; targetType: "task" | "requirement" }) {
  const [state, action] = useActionState(addComment, initial);
  return <form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} /><input type="hidden" name="target_id" value={targetId} /><input type="hidden" name="target_type" value={targetType} /><Field><FieldLabel htmlFor="comment-content">Nuevo comentario</FieldLabel><Textarea id="comment-content" name="content" required maxLength={5000} rows={3} placeholder="Añade contexto o comparte un avance" /></Field>{state.error && <FieldError>{state.error}</FieldError>}<Submit>Publicar comentario</Submit></FieldGroup></form>;
}
