"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useDebounce } from "@/hooks/use-debounce";

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(query);
  const [selectedStatus, setSelectedStatus] = useState(status);
  const [selectedKind, setSelectedKind] = useState(kind || "all");
  const [isPending, startTransition] = useTransition();
  const debouncedSearch = useDebounce(search, 350);

  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    const normalizedSearch = debouncedSearch.trim().slice(0, 120);
    next.set("workspace", workspaceId);
    next.set("view", "ideas");
    if (normalizedSearch) next.set("q", normalizedSearch);
    else next.delete("q");
    if (selectedStatus === "active") next.delete("status");
    else next.set("status", selectedStatus);
    if (selectedKind === "all") next.delete("kind");
    else next.set("kind", selectedKind);
    if (next.toString() === searchParams.toString()) return;
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }, [debouncedSearch, pathname, router, searchParams, selectedKind, selectedStatus, workspaceId]);

  return <div role="search" aria-label="Filtrar ideas" aria-busy={isPending} className="mb-8 rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
    <FieldGroup className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
      <Field><FieldLabel htmlFor="idea-search" className="sr-only">Buscar ideas</FieldLabel><div className="relative"><Search className="pointer-events-none absolute top-3.5 left-3.5 size-4 text-muted-foreground" aria-hidden /><Input id="idea-search" name="q" maxLength={120} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, notas o etiquetas" className="pr-10 pl-10" />{isPending && <Spinner className="absolute top-3.5 right-3.5 text-primary" aria-label="Buscando" />}</div></Field>
      <Field><FieldLabel htmlFor="idea-status" className="sr-only">Estado</FieldLabel><Select value={selectedStatus} onValueChange={(value) => value && setSelectedStatus(value)} items={statuses}><SelectTrigger id="idea-status" className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{statuses.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
      <Field><FieldLabel htmlFor="idea-filter-kind" className="sr-only">Tipo</FieldLabel><Select value={selectedKind} onValueChange={(value) => value && setSelectedKind(value)} items={kinds}><SelectTrigger id="idea-filter-kind" className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{kinds.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    </FieldGroup>
    <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">{isPending ? "Actualizando resultados…" : "Los filtros se aplican automáticamente."}</p>
  </div>;
}
