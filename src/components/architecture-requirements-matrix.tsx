"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { optionLabel } from "@/lib/documentation-model";
import { requirementCoverage, requirementKinds, requirementPriorities } from "@/lib/project-model";

type Requirement = { id: string; title: string; description: string; acceptance_criteria: string; kind: string; priority: string; status: string };
type Task = { id: string; title: string; status: string };
type LinkRow = { task_id: string; requirement_id: string };

function Highlight({ text, query }: { text: string; query: string }) {
  const term = query.trim();
  if (!term) return text;
  const index = text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  if (index < 0) return text;
  return <>{text.slice(0, index)}<mark className="rounded-sm bg-amber-200 px-0.5 text-foreground">{text.slice(index, index + term.length)}</mark>{text.slice(index + term.length)}</>;
}

export function ArchitectureRequirementsMatrix({ projectId, requirements, tasks, links }: {
  projectId: string;
  requirements: Requirement[];
  tasks: Task[];
  links: LinkRow[];
}) {
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState("all");
  const [status, setStatus] = useState("active");
  const [page, setPage] = useState(0);
  const pageSize = 8;
  const filtered = useMemo(() => requirements.filter((requirement) => {
    const matchesText = `${requirement.id} ${requirement.title} ${requirement.description} ${requirement.acceptance_criteria}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesText && (priority === "all" || requirement.priority === priority)
      && (status === "all" || requirement.status === status);
  }), [priority, query, requirements, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(Math.min(page, pageCount - 1) * pageSize, (Math.min(page, pageCount - 1) + 1) * pageSize);
  const activeRequirements = requirements.filter((item) => item.status === "active");
  const completion = activeRequirements.reduce((total, requirement) => {
    const coverage = requirementCoverage(requirement.id, links, tasks);
    return { completed: total.completed + coverage.completed, linked: total.linked + coverage.total };
  }, { completed: 0, linked: 0 });

  return <Card className="overflow-hidden border-border/60 shadow-sm">
    <CardHeader className="gap-4 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 flex items-center gap-2"><span className="size-2.5 rounded-full bg-primary" /><CardTitle className="text-xl">Matriz de requisitos y cobertura técnica</CardTitle></div><CardDescription>Especificación funcional vinculada al trabajo y a la arquitectura del proyecto.</CardDescription></div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-56 flex-1 sm:w-64 sm:flex-none"><Search aria-hidden className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Filtrar por ID, texto o criterio…" className="h-10 rounded-full bg-muted/60 pl-9" /><span className="sr-only">Buscar requisitos</span></label>
        <Select value={priority} onValueChange={(value) => { if (value) { setPriority(value); setPage(0); } }}><SelectTrigger aria-label="Filtrar por prioridad" className="h-10 w-36 rounded-full bg-muted/60"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Prioridad: todas</SelectItem>{requirementPriorities.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
        <Select value={status} onValueChange={(value) => { if (value) { setStatus(value); setPage(0); } }}><SelectTrigger aria-label="Filtrar por estado" className="h-10 w-32 rounded-full bg-muted/60"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="active">Activos</SelectItem><SelectItem value="archived">Archivados</SelectItem><SelectItem value="all">Todos</SelectItem></SelectGroup></SelectContent></Select>
      </div>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-pastel-lavender/65 p-3 text-xs text-muted-foreground"><div className="flex items-center gap-2"><CircleDashed aria-hidden className="size-4 text-primary" /><span>Vista de trazabilidad activa · mostrando {visible.length} de {filtered.length} requisitos.</span></div><span>Restablecer vista <Button type="button" size="xs" variant="secondary" onClick={() => { setQuery(""); setPriority("all"); setStatus("active"); setPage(0); }}>Limpiar</Button></span></div>
      <div className="overflow-x-auto rounded-2xl border border-border/60">
        <table className="w-full min-w-[980px] border-collapse text-left text-xs">
          <thead className="bg-muted/55 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">ID · dominio</th><th className="px-4 py-3 font-semibold">Definición del requisito</th><th className="px-4 py-3 font-semibold">Prioridad</th><th className="px-4 py-3 font-semibold">Estado y cobertura</th><th className="px-4 py-3 font-semibold">Criterios de aceptación</th><th className="px-4 py-3 font-semibold">Tareas vinculadas</th></tr></thead>
          <tbody className="divide-y divide-border/50">
            {visible.map((requirement) => {
              const coverage = requirementCoverage(requirement.id, links, tasks);
              const linkedTasks = links.filter((link) => link.requirement_id === requirement.id).map((link) => tasks.find((task) => task.id === link.task_id)).filter((task): task is Task => Boolean(task));
              return <tr key={requirement.id} className="align-top transition-colors hover:bg-muted/20">
                <td className="w-36 px-4 py-4"><Link href={`/projects/${projectId}/requirements/${requirement.id}`} className="font-semibold text-primary hover:underline">REQ-{requirement.id.slice(0, 6).toUpperCase()}</Link><span className="mt-1 block text-[10px] text-muted-foreground">{optionLabel(requirementKinds, requirement.kind)}</span></td>
                <td className="min-w-52 px-4 py-4"><Link href={`/projects/${projectId}/requirements/${requirement.id}`} className="font-semibold hover:text-primary"><Highlight text={requirement.title} query={query} /></Link><p className="mt-1 max-w-xs leading-relaxed text-muted-foreground"><Highlight text={requirement.description || "Sin descripción adicional."} query={query} /></p></td>
                <td className="px-4 py-4"><Badge variant={requirement.priority === "p0" ? "destructive" : "secondary"} className="rounded-full">{optionLabel(requirementPriorities, requirement.priority)}</Badge></td>
                <td className="min-w-36 px-4 py-4"><div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium">{coverage.percent === 100 ? <CheckCircle2 className="size-3.5 text-emerald-700" /> : <CircleDashed className="size-3.5 text-primary" />}{requirement.status === "archived" ? "Archivado" : coverage.total ? `${coverage.percent}% cubierto` : "Sin tareas"}</div><Progress value={coverage.percent} className="h-1.5" /><span className="mt-1 block text-[10px] text-muted-foreground">{coverage.completed} de {coverage.total} tareas terminadas</span></td>
                <td className="min-w-56 px-4 py-4"><div className="max-w-sm rounded-xl bg-muted/55 p-3 leading-relaxed text-muted-foreground">{requirement.acceptance_criteria || "Criterios pendientes de definición."}</div></td>
                <td className="min-w-36 px-4 py-4"><div className="flex flex-col items-start gap-1.5">{linkedTasks.slice(0, 3).map((task) => <Link key={task.id} href={`/projects/${projectId}/tasks/${task.id}`} className="max-w-36 truncate rounded-full bg-secondary px-2 py-1 text-[10px] font-medium hover:text-primary">{task.title}</Link>)}{linkedTasks.length > 3 && <Badge variant="outline">+{linkedTasks.length - 3}</Badge>}{!linkedTasks.length && <span className="text-muted-foreground">Sin tareas aún</span>}</div></td>
              </tr>;
            })}
            {!visible.length && <tr><td colSpan={6} className="px-4 py-14 text-center text-sm text-muted-foreground">No hay requisitos que coincidan con esos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>Vinculadas: {completion.completed} de {completion.linked} tareas completadas.</span><div className="flex items-center gap-2"><Button type="button" size="xs" variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</Button><span>{Math.min(page + 1, pageCount)} / {pageCount}</span><Button type="button" size="xs" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Siguiente</Button></div></div>
    </CardContent>
  </Card>;
}
