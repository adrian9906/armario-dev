"use client";

import { useActionState } from "react";
import { saveNotificationPreferences, type NotificationPreferenceState } from "@/app/notification-actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";

type Preferences = { assignments: boolean; comments: boolean; project_access: boolean };
const initial: NotificationPreferenceState = { error: null };

export function NotificationPreferencesForm({ workspaceId, preferences }: { workspaceId: string; preferences: Preferences }) {
  const [state, action] = useActionState(saveNotificationPreferences, initial);
  const options = [
    { name: "assignments", label: "Asignaciones", description: "Cuando una tarea queda a tu cargo.", checked: preferences.assignments },
    { name: "comments", label: "Comentarios", description: "Cuando comentan en trabajo relacionado contigo.", checked: preferences.comments },
    { name: "project_access", label: "Acceso a proyectos", description: "Cuando te añaden a un proyecto restringido.", checked: preferences.project_access },
  ];
  return <form action={action}><FieldGroup><input type="hidden" name="workspace_id" value={workspaceId} />{options.map((option) => <Field key={option.name} orientation="horizontal" className="rounded-2xl border border-border/70 p-4"><Checkbox id={`preference-${option.name}`} name={option.name} defaultChecked={option.checked} /><div><FieldLabel htmlFor={`preference-${option.name}`}>{option.label}</FieldLabel><FieldDescription>{option.description}</FieldDescription></div></Field>)}{state.error && <FieldError>{state.error}</FieldError>}{state.success && <p className="text-sm text-emerald-700">{state.success}</p>}<Button type="submit">Guardar preferencias</Button></FieldGroup></form>;
}
