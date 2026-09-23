"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createIdea, createWorkspace, inviteMember, renameProfile, renameWorkspace, updateIdea } from "@/app/dashboard/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const initialFormState = { error: null };
const ideaKinds = [
  { value: "undecided", label: "Aún no lo sé" },
  { value: "web", label: "Web" },
  { value: "mobile", label: "Móvil" },
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "mixed", label: "Frontend y backend" },
  { value: "other", label: "Otro" },
];
const inviteRoles = [
  { value: "admin", label: "Administrador · equipo e ideas" },
  { value: "editor", label: "Editor · crea y edita ideas" },
  { value: "viewer", label: "Lector · consulta el contenido" },
];

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Guardando…" : children}</Button>;
}

export function CreateWorkspaceForm() {
  const [state, action] = useActionState(createWorkspace, initialFormState);
  return <form action={action}><FieldGroup>
    <Field data-invalid={Boolean(state.error)}><FieldLabel htmlFor="workspace-name">Nombre del espacio</FieldLabel><Input id="workspace-name" name="name" aria-invalid={Boolean(state.error)} placeholder="Por ejemplo, Laboratorio Atlas" />{state.error && <FieldError>{state.error}</FieldError>}</Field>
    <Submit>Crear espacio</Submit>
  </FieldGroup></form>;
}

export function RenameWorkspaceForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [state, action] = useActionState(renameWorkspace, initialFormState);
  return <form action={action}><FieldGroup>
    <input type="hidden" name="workspace_id" value={workspaceId} />
    <Field><FieldLabel htmlFor="rename-workspace">Nombre del espacio</FieldLabel><Input key={`${workspaceId}:${name}`} id="rename-workspace" name="name" maxLength={120} required defaultValue={name} /></Field>
    {state.error && <FieldError>{state.error}</FieldError>}
    <Submit>Guardar nombre</Submit>
  </FieldGroup></form>;
}

export function RenameProfileForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [state, action] = useActionState(renameProfile, initialFormState);
  return <form action={action}><FieldGroup>
    <input type="hidden" name="workspace_id" value={workspaceId} />
    <Field data-invalid={Boolean(state.error)}><FieldLabel htmlFor="profile-name">Tu nombre</FieldLabel><Input key={name} id="profile-name" name="name" maxLength={120} required defaultValue={name} aria-invalid={Boolean(state.error)} />{state.error && <FieldError>{state.error}</FieldError>}</Field>
    <Submit>Guardar mi nombre</Submit>
  </FieldGroup></form>;
}

type IdeaValues = { id?: string; title: string; description: string; kind: string | null; tags: string[] };
export function IdeaForm({ workspaceId, idea }: { workspaceId: string; idea?: IdeaValues }) {
  const [state, action] = useActionState(idea ? updateIdea : createIdea, initialFormState);
  const [kind, setKind] = useState(idea?.kind || "undecided");
  return <form action={action}><FieldGroup>
    <input type="hidden" name="workspace_id" value={workspaceId} />
    <input type="hidden" name="kind" value={kind} />
    {idea?.id && <input type="hidden" name="idea_id" value={idea.id} />}
    <Field><FieldLabel htmlFor="idea-title">Título de la idea</FieldLabel><Input id="idea-title" name="title" maxLength={160} required defaultValue={idea?.title} placeholder="¿Qué quieres construir?" /></Field>
    <Field><FieldLabel htmlFor="idea-description">Notas</FieldLabel><Textarea id="idea-description" name="description" maxLength={10000} rows={6} defaultValue={idea?.description} placeholder="El problema, para quién es y lo que imaginas…" /></Field>
    <div className="grid gap-5 sm:grid-cols-2">
      <Field><FieldLabel htmlFor="idea-kind">Tipo inicial</FieldLabel><Select value={kind} onValueChange={(value) => value && setKind(value)} items={ideaKinds}><SelectTrigger id="idea-kind" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{ideaKinds.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field><FieldLabel htmlFor="idea-tags">Etiquetas</FieldLabel><Input id="idea-tags" name="tags" defaultValue={idea?.tags.join(", ")} placeholder="productividad, equipo, SaaS" /><p className="text-xs text-muted-foreground">Separadas por comas; hasta 12.</p></Field>
    </div>
    {state.error && <FieldError>{state.error}</FieldError>}
    <Submit>{idea ? "Guardar cambios" : "Guardar idea"}</Submit>
  </FieldGroup></form>;
}

export function InviteMemberForm({ workspaceId }: { workspaceId: string }) {
  const [state, action] = useActionState(inviteMember, initialFormState);
  return <form action={action}><FieldGroup>
    <input type="hidden" name="workspace_id" value={workspaceId} />
    <Field><FieldLabel htmlFor="invite-email">Correo de la persona</FieldLabel><Input id="invite-email" name="email" type="email" maxLength={254} required placeholder="persona@ejemplo.com" /></Field>
    <Field><FieldLabel htmlFor="invite-role">Rol en el espacio</FieldLabel><Select name="role" defaultValue="editor" items={inviteRoles}><SelectTrigger id="invite-role" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{inviteRoles.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    {state.error && <FieldError>{state.error}</FieldError>}
    <Submit>Enviar invitación</Submit>
  </FieldGroup></form>;
}
