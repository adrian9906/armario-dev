import Link from "next/link";
import { ArrowRight, Boxes, CheckCircle2, ClipboardList, GitBranch, Layers3, Plus, Scale } from "lucide-react";
import { CreateDiagramDialog } from "@/components/create-diagram-dialog";
import { DocumentationExportDialog } from "@/components/documentation-export-dialog";
import { DiagramEditor } from "@/components/diagram-editor";
import { ArchitectureRequirementsMatrix } from "@/components/architecture-requirements-matrix";
import { TechnologyIcon } from "@/components/technology-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { decisionStatuses, diagramKinds, optionLabel, technologyCategories, technologyStatuses } from "@/lib/documentation-model";

type Requirement = { id: string; title: string; description: string; acceptance_criteria: string; kind: string; priority: string; status: string };
type Task = { id: string; title: string; status: string };
type RequirementLink = { task_id: string; requirement_id: string };
type Technology = { id: string; name: string; category: string; status: string; version: string; rationale: string };
type Decision = { id: string; title: string; status: string; decided_at: string; context: string; decision: string; consequences: string };
type Diagram = { id: string; title: string; kind: string; source: string; status: string; updated_at: string };

const architectureTabs = [
  { value: "requirements", label: "Requisitos funcionales", icon: ClipboardList },
  { value: "diagrams", label: "Diagramas C4 y flujos", icon: GitBranch },
  { value: "technologies", label: "Stack tecnológico", icon: Boxes },
  { value: "decisions", label: "Decisiones ADR", icon: Scale },
] as const;

export function ArchitectureWorkspace({ projectId, projectTitle, canEdit, section, requirements, tasks, links, technologies, decisions, diagrams }: {
  projectId: string;
  projectTitle: string;
  canEdit: boolean;
  section: typeof architectureTabs[number]["value"];
  requirements: Requirement[];
  tasks: Task[];
  links: RequirementLink[];
  technologies: Technology[];
  decisions: Decision[];
  diagrams: Diagram[];
}) {
  const activeRequirements = requirements.filter((requirement) => requirement.status === "active");
  const activeDiagrams = diagrams.filter((diagram) => diagram.status === "active");
  const latestDecision = decisions[0];
  const sectionHref = (value: string) => `/projects/${projectId}?view=documentation&section=${value}`;
  const mainDiagram = activeDiagrams[0];

  return <section className="mt-7 flex flex-col gap-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2"><Badge className="rounded-full bg-pastel-lavender text-primary">Definición &amp; Arquitectura</Badge><Badge variant="secondary" className="rounded-full">{requirements.length} requisitos · {activeDiagrams.length} diagramas</Badge></div>
        <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Arquitectura Viva &amp; Trazabilidad</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Conecta requisitos, decisiones y componentes para mantener el plano técnico cerca del trabajo real.</p>
      </div>
      <div className="flex flex-wrap gap-2"><DocumentationExportDialog projectId={projectId} projectTitle={projectTitle} />{canEdit && <Button render={<Link href={`/projects/${projectId}/requirements/new`} />}><Plus data-icon="inline-start" />Nuevo requisito</Button>}</div>
    </div>

    <nav aria-label="Secciones de arquitectura" className="flex w-full gap-1 overflow-x-auto rounded-full bg-muted/70 p-1.5 sm:w-fit">
      {architectureTabs.map(({ value, label, icon: Icon }) => <Link key={value} href={sectionHref(value)} aria-current={section === value ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-medium transition-colors sm:text-sm ${section === value ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}><Icon className="size-4" aria-hidden />{label}{value === "decisions" && decisions.length > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${section === value ? "bg-white/20" : "bg-card"}`}>{decisions.length}</span>}</Link>)}
    </nav>

    {section === "diagrams" && <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(280px,0.75fr)]">
      <Card className="overflow-hidden border-0">
        <CardHeader className="gap-3 border-b border-border/50 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><CardTitle className="text-base sm:text-lg">{mainDiagram ? `${optionLabel(diagramKinds, mainDiagram.kind)} · ${mainDiagram.title}` : "Plano de arquitectura"}</CardTitle>{mainDiagram && <Badge variant="secondary" className="rounded-full">Vista activa</Badge>}</div><CardDescription className="mt-1">Arrastra el lienzo y usa zoom para explorar componentes y conexiones.</CardDescription></div>{mainDiagram ? <Button size="sm" variant="outline" render={<Link href={`/projects/${projectId}/documentation/diagrams/${mainDiagram.id}`} />}>Abrir editor <ArrowRight data-icon="inline-end" /></Button> : canEdit ? <CreateDiagramDialog projectId={projectId} /> : null}</CardHeader>
        <CardContent className="p-3 sm:p-5">{mainDiagram ? <DiagramEditor value={mainDiagram.source} readOnly /> : <div className="flex min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/25 p-8 text-center"><span className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender text-primary"><GitBranch aria-hidden /></span><p className="font-semibold">Todavía no hay diagramas</p><p className="mt-1 max-w-sm text-sm text-muted-foreground">Añade un diagrama para visualizar los límites, integraciones y flujos de {projectTitle}.</p>{canEdit && <div className="mt-5"><CreateDiagramDialog projectId={projectId} /></div>}</div>}</CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {latestDecision ? <Card className="border-0"><CardHeader className="gap-3 pb-3"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Registro de decisión de arquitectura</p><CardTitle className="mt-2 text-xl">{latestDecision.title}</CardTitle></div><Badge variant={latestDecision.status === "accepted" ? "default" : "secondary"} className="shrink-0 rounded-full">{optionLabel(decisionStatuses, latestDecision.status)}</Badge></div><CardDescription>Actualizada {new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(new Date(latestDecision.decided_at))}</CardDescription></CardHeader><CardContent className="flex flex-col gap-4 text-sm"><div className="rounded-xl bg-muted/55 p-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Contexto</p><p className="line-clamp-4 leading-relaxed">{latestDecision.context || "Sin contexto adicional."}</p></div><div className="rounded-xl border-l-2 border-primary bg-pastel-lavender/35 p-3"><p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Decisión elegida</p><p className="line-clamp-4 leading-relaxed">{latestDecision.decision || "Pendiente de detalle."}</p></div><Link href={sectionHref("decisions")} className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline">Ver todas las decisiones <ArrowRight className="size-3.5" /></Link></CardContent></Card> : <Card className="border-0"><CardHeader><span className="flex size-10 items-center justify-center rounded-xl bg-pastel-lavender text-primary"><Scale aria-hidden /></span><CardTitle>Decisiones técnicas</CardTitle><CardDescription>Conserva el porqué de las elecciones importantes.</CardDescription></CardHeader><CardContent>{canEdit && <Button size="sm" variant="outline" render={<Link href={`/projects/${projectId}/documentation/decisions/new`} />}>Crear primer ADR <Plus data-icon="inline-end" /></Button>}</CardContent></Card>}
        <Card className="border-0 bg-pastel-sky/45"><CardHeader className="flex-row items-center gap-3 pb-2"><span className="flex size-9 items-center justify-center rounded-xl bg-card text-primary"><Layers3 aria-hidden /></span><div><CardTitle className="text-sm">Trazabilidad en contexto</CardTitle><CardDescription className="text-xs">Matriz conectada a tareas</CardDescription></div></CardHeader><CardContent className="flex items-end justify-between gap-3"><p className="text-xs leading-relaxed text-muted-foreground">Consulta cobertura, prioridades y criterios de aceptación en la matriz.</p><a href="#requirements-matrix" className="shrink-0 text-xs font-semibold text-primary hover:underline">Ver matriz ↓</a></CardContent></Card>
      </div>
    </div>}

    {section === "requirements" && <div className="rounded-2xl bg-pastel-sky/45 p-4 sm:p-5"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-card text-primary"><ClipboardList aria-hidden /></span><div><h3 className="font-semibold">Requisitos funcionales y de calidad</h3><p className="text-sm text-muted-foreground">Controla definición, prioridad, criterios y avance vinculado.</p></div></div></div>}

    {section === "technologies" && <div className="grid gap-5 lg:grid-cols-[1.4fr_0.8fr]">
      <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Stack tecnológico</CardTitle><CardDescription>Candidatas, elecciones y alternativas con su justificación.</CardDescription></div>{canEdit && <Button size="sm" render={<Link href={`/projects/${projectId}/documentation/stack/new`} />}><Plus data-icon="inline-start" />Añadir tecnología</Button>}</div></CardHeader><CardContent>{technologies.length ? <div className="grid gap-3 sm:grid-cols-2">{technologies.map((technology) => <Link key={technology.id} href={`/projects/${projectId}/documentation/stack/${technology.id}`} className="group rounded-2xl border border-border/70 p-4 transition-colors hover:bg-accent"><div className="flex items-start gap-3"><TechnologyIcon name={technology.name} className="size-10 rounded-xl border shadow-sm [&_img]:size-6" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold group-hover:text-primary">{technology.name}{technology.version ? ` ${technology.version}` : ""}</span><Badge variant={technology.status === "selected" ? "default" : "outline"}>{optionLabel(technologyStatuses, technology.status)}</Badge></div><p className="mt-1.5 text-xs text-muted-foreground">{optionLabel(technologyCategories, technology.category)}{technology.rationale ? ` · ${technology.rationale}` : ""}</p></div></div></Link>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">Todavía no se ha documentado el stack del proyecto.</p>}</CardContent></Card>
      <Card className="border-0 bg-pastel-lavender/60"><CardHeader><div className="flex size-10 items-center justify-center rounded-xl bg-card text-primary"><Boxes aria-hidden /></div><CardTitle>Inventario técnico</CardTitle><CardDescription>{technologies.filter((technology) => technology.status === "selected").length} tecnologías elegidas de {technologies.length} registradas.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{technologies.filter((technology) => technology.status === "selected").slice(0, 6).map((technology) => <Badge key={technology.id} variant="secondary" className="rounded-full bg-card">{technology.name}</Badge>)}{!technologies.some((technology) => technology.status === "selected") && <span className="text-sm text-muted-foreground">Aún no hay tecnologías elegidas.</span>}</CardContent></Card>
    </div>}

    {section === "decisions" && <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-pastel-lavender text-primary"><Scale aria-hidden /></span><div><CardTitle>Decisiones de arquitectura</CardTitle><CardDescription>Contexto, alternativa elegida y consecuencias.</CardDescription></div></div>{canEdit && <Button size="sm" render={<Link href={`/projects/${projectId}/documentation/decisions/new`} />}><Plus data-icon="inline-start" />Nueva decisión</Button>}</div></CardHeader><CardContent>{decisions.length ? <div className="grid gap-3 lg:grid-cols-2">{decisions.map((decision) => <Link key={decision.id} href={`/projects/${projectId}/documentation/decisions/${decision.id}`} className="group rounded-2xl border border-border/70 p-5 transition-colors hover:bg-accent"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(new Date(decision.decided_at))}</p><h3 className="mt-1 font-semibold group-hover:text-primary">{decision.title}</h3></div><Badge variant={decision.status === "accepted" ? "default" : "secondary"}>{optionLabel(decisionStatuses, decision.status)}</Badge></div><p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{decision.context || "Sin contexto registrado."}</p><p className="mt-3 line-clamp-2 rounded-xl bg-muted/55 p-3 text-xs leading-relaxed">{decision.decision || "Decisión pendiente de detalle."}</p></Link>)}</div> : <div className="py-10 text-center text-sm text-muted-foreground">Todavía no hay decisiones de arquitectura.</div>}</CardContent></Card>}

    {section === "diagrams" && activeDiagrams.length > 1 && <Card><CardHeader><CardTitle className="text-base">Otros diagramas activos</CardTitle><CardDescription>Abre un diagrama para consultar su editor, historial y trazabilidad.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{activeDiagrams.slice(1).map((diagram) => <Link key={diagram.id} href={`/projects/${projectId}/documentation/diagrams/${diagram.id}`} className="group rounded-2xl border border-border/70 p-4 transition-colors hover:bg-accent"><div className="flex items-start justify-between gap-3"><span className="font-semibold group-hover:text-primary">{diagram.title}</span><Badge variant="outline">{optionLabel(diagramKinds, diagram.kind)}</Badge></div><p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">Abrir editor y versiones <ArrowRight className="size-3" /></p></Link>)}</CardContent></Card>}

    <div id="requirements-matrix" className="scroll-mt-24"><ArchitectureRequirementsMatrix projectId={projectId} requirements={section === "requirements" ? requirements : activeRequirements} tasks={tasks} links={links} /></div>
    {section === "diagrams" && <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4 text-emerald-700" /> Cambiar a otras secciones conserva este resumen y su trazabilidad.</div>}
  </section>;
}
