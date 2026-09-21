"use client";

import { useActionState } from "react";
import { addProjectMember, updateProjectVisibility } from "@/app/projects/access-actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const initial = { error: null };
const visibilityOptions = [
  { value: "workspace", label: "Todo el espacio" },
  { value: "private", label: "Privado" },
  { value: "restricted", label: "Personas elegidas" },
] as const;
const roleOptions = [
  { value: "manager", label: "Administrador" },
  { value: "editor", label: "Editor" },
  { value: "contributor", label: "Colaborador" },
  { value: "viewer", label: "Lector" },
] as const;

function Choice({ id, name, options, defaultValue }: { id: string; name: string; options: readonly { value: string; label: string }[]; defaultValue: string }) {
  return <Select name={name} defaultValue={defaultValue} items={options}><SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select>;
}

export function ProjectVisibilityForm({ projectId, visibility }: { projectId: string; visibility: string }) {
  const [state, action] = useActionState(updateProjectVisibility, initial);
  return <form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} /><Field><FieldLabel htmlFor="project-visibility">Quién puede abrir el proyecto</FieldLabel><FieldDescription>Los propietarios y administradores del espacio siempre conservan acceso.</FieldDescription><Choice id="project-visibility" name="visibility" options={visibilityOptions} defaultValue={visibility} /></Field>{state.error && <FieldError>{state.error}</FieldError>}{state.success && <p className="text-sm text-emerald-700">{state.success}</p>}<Button type="submit">Guardar visibilidad</Button></FieldGroup></form>;
}

export function ProjectMemberForm({ projectId, members }: { projectId: string; members: { user_id: string; name: string }[] }) {
  const [state, action] = useActionState(addProjectMember, initial);
  const people = members.map((member) => ({ value: member.user_id, label: member.name }));
  return <form action={action}><FieldGroup><input type="hidden" name="project_id" value={projectId} /><Field><FieldLabel htmlFor="project-member">Persona</FieldLabel><Choice id="project-member" name="user_id" options={people} defaultValue={people[0]?.value ?? ""} /></Field><Field><FieldLabel htmlFor="project-role">Rol dentro del proyecto</FieldLabel><Choice id="project-role" name="role" options={roleOptions} defaultValue="contributor" /></Field>{state.error && <FieldError>{state.error}</FieldError>}{state.success && <p className="text-sm text-emerald-700">{state.success}</p>}<Button type="submit" disabled={!people.length}>Guardar acceso</Button></FieldGroup></form>;
}
