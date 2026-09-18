"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { TaskDateRange } from "@/components/task-date-range";
import { addChecklistItem, addComment, convertIdea, createRequirement, createTask, updateProject, updateRequirement, updateTask } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { moduleOptions, projectKinds, projectStages, requirementKinds, requirementPriorities, taskPriorities, taskStatuses, type ProjectModules } from "@/lib/project-model";

const initial = { error: null };
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

export function ConvertIdeaForm({ ideaId, suggestedKind }: { ideaId: string; suggestedKind: string | null }) {
  const [state, action] = useActionState(convertIdea, initial);
  const kind = projectKinds.some((item) => item.value === suggestedKind) ? suggestedKind! : "web";
  const modules = { frontend: ["web", "frontend", "mixed", "mobile"].includes(kind), backend: ["web", "backend", "mixed"].includes(kind), database: false, auth: false };
  return <form action={action}><FieldGroup><input type="hidden" name="idea_id" value={ideaId} /><ChoiceSelect id="convert-kind" name="kind" label="Tipo de proyecto" options={projectKinds} defaultValue={kind} /><ModuleFields selected={modules} />{state.error && <FieldError>{state.error}</FieldError>}<Submit>Crear proyecto a partir de la idea</Submit></FieldGroup></form>;
}

type ProjectValues = { id: string; title: string; objective: string; kind: string; stage: string; modules: ProjectModules };
export function ProjectSettingsForm({ project }: { project: ProjectValues }) {
  const [state, action] = useActionState(updateProject, initial);
  return <form action={action}><FieldGroup><input type="hidden" name="project_id" value={project.id} /><Field><FieldLabel htmlFor="project-title">Nombre</FieldLabel><Input id="project-title" name="title" required maxLength={160} defaultValue={project.title} /></Field><Field><FieldLabel htmlFor="project-objective">Objetivo</FieldLabel><Textarea id="project-objective" name="objective" rows={5} maxLength={10000} defaultValue={project.objective} /></Field><div className="grid gap-5 sm:grid-cols-2"><ChoiceSelect id="project-kind" name="kind" label="Tipo" options={projectKinds} defaultValue={project.kind} /><ChoiceSelect id="project-stage" name="stage" label="Etapa" options={projectStages} defaultValue={project.stage} /></div><ModuleFields selected={project.modules} />{state.error && <FieldError>{state.error}</FieldError>}<Submit>Guardar proyecto</Submit></FieldGroup></form>;
}

type Member = { user_id: string; name: string };
type TaskValues = { id: string; title: string; description: string; status: string; priority: string; assignee_id: string | null; start_date: string | null; due_date: string | null };
export function TaskForm({ projectId, members, task }: { projectId: string; members: Member[]; task?: TaskValues }) {
  const [state, action] = useActionState(task ? updateTask : createTask, initial);
  const assignees = [{ value: "unassigned", label: "Sin asignar" }, ...members.map((member) => ({ value: member.user_id, label: member.name }))];
  return <form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} />{task && <input type="hidden" name="task_id" value={task.id} />}<Field><FieldLabel htmlFor="task-title">Título de la tarea</FieldLabel><Input id="task-title" name="title" required maxLength={160} defaultValue={task?.title} placeholder="¿Qué hay que hacer?" /></Field><Field><FieldLabel htmlFor="task-description">Descripción</FieldLabel><Textarea id="task-description" name="description" rows={4} maxLength={10000} defaultValue={task?.description} placeholder="Contexto o indicaciones para el equipo" /></Field><div className="grid gap-5 sm:grid-cols-2"><ChoiceSelect id="task-status" name="status" label="Estado" options={taskStatuses} defaultValue={task?.status === "archived" ? "todo" : task?.status ?? "todo"} /><ChoiceSelect id="task-priority" name="priority" label="Prioridad" options={taskPriorities} defaultValue={task?.priority ?? "medium"} /><ChoiceSelect id="task-assignee" name="assignee_id" label="Responsable" options={assignees} defaultValue={task?.assignee_id ?? "unassigned"} /></div><TaskDateRange startDate={task?.start_date} dueDate={task?.due_date} />{!task && <Field><FieldLabel htmlFor="task-checklist">Checklist inicial</FieldLabel><FieldDescription>Escribe un paso por línea. Podrás añadir más después.</FieldDescription><Textarea id="task-checklist" name="checklist" rows={4} maxLength={9000} placeholder="Definir la pantalla principal" /></Field>}{state.error && <FieldError>{state.error}</FieldError>}<Submit>{task ? "Guardar tarea" : "Crear tarea"}</Submit></FieldGroup></form>;
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
