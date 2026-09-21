"use client";

import { useActionState, useState } from "react";
import {
  saveDecision,
  saveDiagram,
  saveTechnology,
} from "@/app/projects/documentation-actions";
import {
  decisionStatuses,
  diagramKinds,
  diagramTemplates,
  optionLabel,
  technologyByKey,
  technologyByName,
  technologyCatalog,
  technologyCategories,
  technologyStatuses,
} from "@/lib/documentation-model";
import { TechnologyIcon } from "@/components/technology-icon";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DiagramEditor } from "@/components/diagram-editor";

const initial = { error: null };
type Option = { value: string; label: string };

function Choice({ id, name, label, options, defaultValue, disabled = false }: {
  id: string; name: string; label: string; options: readonly Option[]; defaultValue: string; disabled?: boolean;
}) {
  return <Field data-disabled={disabled || undefined}><FieldLabel htmlFor={id}>{label}</FieldLabel><Select name={name} items={options} defaultValue={defaultValue} disabled={disabled}>
    <SelectTrigger id={id}><SelectValue>{(value) => optionLabel(options, String(value ?? ""))}</SelectValue></SelectTrigger>
    <SelectContent><SelectGroup>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select></Field>;
}

function Submit({ children }: { children: React.ReactNode }) {
  return <Button type="submit" className="self-start">{children}</Button>;
}

function resetTechnologyCatalogScroll(open: boolean) {
  if (!open) return;
  const reset = () => document.querySelector<HTMLElement>("[data-technology-catalog]")?.scrollTo({ top: 0 });
  window.requestAnimationFrame(() => {
    reset();
    window.requestAnimationFrame(reset);
  });
}

export type TechnologyValues = {
  id: string; name: string; category: string; status: string; version: string; rationale: string;
};

export function TechnologyForm({ projectId, technology, readOnly = false }: { projectId: string; technology?: TechnologyValues; readOnly?: boolean }) {
  const [state, action] = useActionState(saveTechnology, initial);
  const selectedTechnology = technology ? technologyByName(technology.name) : undefined;
  return <form action={action}><FieldGroup>
    <input type="hidden" name="project_id" value={projectId} />
    {technology && <input type="hidden" name="technology_id" value={technology.id} />}
    <div className="grid gap-5 sm:grid-cols-[1.4fr_0.6fr]">
      <Field data-disabled={readOnly || undefined}>
        <FieldLabel htmlFor="technology-key">Tecnología</FieldLabel>
        <FieldDescription>Incluye frameworks, lenguajes, bases de datos, servicios y herramientas. Desplázate para ver todas las categorías.</FieldDescription>
        <Select name="technology_key" items={technologyCatalog.map((item) => ({ value: item.key, label: item.name }))} defaultValue={selectedTechnology?.key} onOpenChange={resetTechnologyCatalogScroll} disabled={readOnly} required>
          <SelectTrigger id="technology-key" className="w-full"><SelectValue>{(value) => {
            const item = technologyByKey(String(value ?? ""));
            return item
              ? <span className="flex min-w-0 items-center gap-2"><TechnologyIcon technology={item} className="size-6" /><span className="truncate">{item.name}</span></span>
              : <span className="text-muted-foreground">Selecciona una tecnología</span>;
          }}</SelectValue></SelectTrigger>
          <SelectContent data-technology-catalog alignItemWithTrigger={false} className="min-w-(--anchor-width) overflow-y-scroll overscroll-contain pr-1" style={{ maxHeight: "min(28rem, var(--available-height))" }}>
            {technologyCategories.map((category) => {
              const technologies = technologyCatalog.filter((item) => item.category === category.value);
              return <SelectGroup key={category.value}>
                <SelectLabel className="sticky top-0 z-10 border-b bg-popover px-2 py-2.5 font-semibold text-foreground">{category.label}</SelectLabel>
                {technologies.map((item) => <SelectItem key={item.key} value={item.key} className="py-2">
                  <TechnologyIcon technology={item} className="size-6" />
                  <span>{item.name}</span>
                </SelectItem>)}
              </SelectGroup>;
            })}
          </SelectContent>
        </Select>
        {technology && !selectedTechnology && <FieldDescription>La tecnología anterior ya no está en el catálogo. Elige una opción para actualizarla.</FieldDescription>}
      </Field>
      <Field><FieldLabel htmlFor="technology-version">Versión</FieldLabel><FieldDescription>Opcional. Indica la versión principal o el rango previsto.</FieldDescription><Input id="technology-version" name="version" maxLength={80} defaultValue={technology?.version} readOnly={readOnly} placeholder="Ej. 16" /></Field>
    </div>
    <Choice id="technology-status" name="status" label="Estado" options={technologyStatuses} defaultValue={technology?.status ?? "candidate"} disabled={readOnly} />
    <Field><FieldLabel htmlFor="technology-rationale">Motivo</FieldLabel><FieldDescription>Explica por qué se evalúa, se elige o se descarta.</FieldDescription><Textarea id="technology-rationale" name="rationale" maxLength={5000} rows={5} defaultValue={technology?.rationale} readOnly={readOnly} placeholder="Criterios técnicos, coste, experiencia del equipo..." /></Field>
    {state.error && <FieldError>{state.error}</FieldError>}
    {!readOnly && <Submit>{technology ? "Guardar tecnología" : "Añadir tecnología"}</Submit>}
  </FieldGroup></form>;
}

export type DecisionValues = {
  id: string; title: string; status: string; context: string; decision: string; consequences: string; decided_at: string;
};

export function DecisionForm({ projectId, decision, readOnly = false }: { projectId: string; decision?: DecisionValues; readOnly?: boolean }) {
  const [state, action] = useActionState(saveDecision, initial);
  return <form action={action}><FieldGroup>
    <input type="hidden" name="project_id" value={projectId} />
    {decision && <input type="hidden" name="decision_id" value={decision.id} />}
    <Field><FieldLabel htmlFor="decision-title">Título</FieldLabel><Input id="decision-title" name="title" required maxLength={160} defaultValue={decision?.title} readOnly={readOnly} placeholder="Ej. Usar un monolito modular" /></Field>
    <div className="grid gap-5 sm:grid-cols-2">
      <Choice id="decision-status" name="status" label="Estado" options={decisionStatuses} defaultValue={decision?.status ?? "proposed"} disabled={readOnly} />
      <Field><FieldLabel htmlFor="decision-date">Fecha</FieldLabel><Input id="decision-date" name="decided_at" type="date" required defaultValue={decision?.decided_at ?? new Date().toISOString().slice(0, 10)} readOnly={readOnly} /></Field>
    </div>
    <Field><FieldLabel htmlFor="decision-context">Contexto</FieldLabel><Textarea id="decision-context" name="context" maxLength={10000} rows={5} defaultValue={decision?.context} readOnly={readOnly} placeholder="Situación, restricciones y problema que motiva la decisión" /></Field>
    <Field><FieldLabel htmlFor="decision-choice">Decisión</FieldLabel><Textarea id="decision-choice" name="decision" maxLength={10000} rows={5} defaultValue={decision?.decision} readOnly={readOnly} placeholder="Qué se decidió y por qué" /></Field>
    <Field><FieldLabel htmlFor="decision-consequences">Consecuencias</FieldLabel><Textarea id="decision-consequences" name="consequences" maxLength={10000} rows={5} defaultValue={decision?.consequences} readOnly={readOnly} placeholder="Beneficios, costes y compromisos asumidos" /></Field>
    {state.error && <FieldError>{state.error}</FieldError>}
    {!readOnly && <Submit>{decision ? "Guardar ADR" : "Crear ADR"}</Submit>}
  </FieldGroup></form>;
}

export type DiagramValues = { id: string; title: string; kind: string; source: string; status: string };
export function DiagramForm({ projectId, diagram, initialKind, initialSource, readOnly = false }: {
  projectId: string; diagram?: DiagramValues; initialKind?: string; initialSource?: string; readOnly?: boolean;
}) {
  const [state, action] = useActionState(saveDiagram, initial);
  const startingKind = diagramKinds.some((item) => item.value === (diagram?.kind ?? initialKind))
    ? (diagram?.kind ?? initialKind) as keyof typeof diagramTemplates
    : "flow";
  const [kind, setKind] = useState<keyof typeof diagramTemplates>(startingKind);
  const [source, setSource] = useState(diagram?.source ?? initialSource ?? diagramTemplates[startingKind]);

  function changeTemplate(value: string | null) {
    if (!value || !(value in diagramTemplates)) return;
    const nextKind = value as keyof typeof diagramTemplates;
    setKind(nextKind);
    setSource(diagramTemplates[nextKind]);
  }

  return <form action={action}><FieldGroup>
    <input type="hidden" name="project_id" value={projectId} />
    {diagram && <input type="hidden" name="diagram_id" value={diagram.id} />}
    <input type="hidden" name="status" value={diagram?.status ?? "active"} />
    <div className="grid gap-5 sm:grid-cols-[1.4fr_0.6fr]">
      <Field><FieldLabel htmlFor="diagram-title">Título</FieldLabel><Input id="diagram-title" name="title" required maxLength={160} defaultValue={diagram?.title} readOnly={readOnly} placeholder="Ej. Flujo de registro" /></Field>
      <Field data-disabled={readOnly || undefined}>
        <FieldLabel htmlFor="diagram-kind">Plantilla</FieldLabel>
        <FieldDescription>Al cambiarla se reemplaza el contenido editable con la plantilla elegida.</FieldDescription>
        <Select name="kind" items={diagramKinds} value={kind} onValueChange={changeTemplate} disabled={readOnly}>
          <SelectTrigger id="diagram-kind" className="w-full"><SelectValue>{() => optionLabel(diagramKinds, kind)}</SelectValue></SelectTrigger>
          <SelectContent><SelectGroup>{diagramKinds.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field>
    </div>
    <DiagramEditor value={source} onChange={setSource} readOnly={readOnly} />
    {state.error && <FieldError>{state.error}</FieldError>}
    {!readOnly && <Submit>{diagram ? "Guardar diagrama" : "Crear diagrama"}</Submit>}
  </FieldGroup></form>;
}
