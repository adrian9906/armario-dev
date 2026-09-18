"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statuses = [
  { value: "active", label: "Activas" },
  { value: "archived", label: "Archivadas" },
  { value: "all", label: "Todos los estados" },
];
const kinds = [
  { value: "all", label: "Todos los tipos" },
  { value: "web", label: "Web" },
  { value: "mobile", label: "Móvil" },
  { value: "frontend", label: "Frontend" },
  { value: "backend", label: "Backend" },
  { value: "mixed", label: "Frontend y backend" },
  { value: "other", label: "Otro" },
  { value: "undecided", label: "Por definir" },
];

export function IdeaFiltersForm({ workspaceId, query, status, kind }: { workspaceId: string; query: string; status: string; kind: string }) {
  return <form method="get" action="/dashboard" className="mb-8 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
    <input type="hidden" name="workspace" value={workspaceId} />
    <input type="hidden" name="view" value="ideas" />
    <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end">
      <Field><FieldLabel htmlFor="idea-search" className="sr-only">Buscar ideas</FieldLabel><div className="relative"><Search className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-muted-foreground" aria-hidden /><Input id="idea-search" name="q" maxLength={120} defaultValue={query} placeholder="Buscar por título, notas o etiquetas" className="pl-10" /></div></Field>
      <Field><FieldLabel htmlFor="idea-status" className="sr-only">Estado</FieldLabel><Select name="status" defaultValue={status} items={statuses}><SelectTrigger id="idea-status" className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{statuses.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field><FieldLabel htmlFor="idea-filter-kind" className="sr-only">Tipo</FieldLabel><Select name="kind" defaultValue={kind || "all"} items={kinds}><SelectTrigger id="idea-filter-kind" className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{kinds.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Button type="submit" variant="outline">Filtrar</Button>
    </FieldGroup>
  </form>;
}
