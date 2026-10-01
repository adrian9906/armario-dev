import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FolderKanban,
  Lightbulb,
  ListTodo,
  Sparkles,
  Scale,
  TrendingUp,
  Users,
} from "lucide-react";
import { ConvertIdeaDialog } from "@/components/project-forms";
import { CreateIdeaDialog } from "@/components/idea-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "cn";

type Idea = { id: string; title: string; description: string; kind: string | null; status: string; tags: string[]; created_at: string; author_id: string };
type Project = { id: string; title: string; objective: string | null; kind: string; stage: string; created_at: string; creator_id: string };
type Task = { id: string; project_id: string; title: string; status: string; assignee_id: string | null };
type Decision = { id: string; status: string };
type ActivityEvent = { id: string; actor_id: string | null; project_id: string | null; action: string; entity_type: string; metadata: { label?: string; status?: string; previous_status?: string; role?: string }; created_at: string };

const route = (workspaceId: string, view: string) => `/dashboard?workspace=${workspaceId}&view=${view}`;
const kindNames: Record<string, string> = { web: "Web y portal", mobile: "Móvil", frontend: "Frontend", backend: "Backend", mixed: "Mixto", other: "Otro", undecided: "Sin clasificar" };
const stageNames: Record<string, string> = { definition: "Definición", planning: "Planificación", development: "Desarrollo activo", published: "Publicado", archived: "Archivado" };
const actionNames: Record<string, string> = { created: "creó", updated: "actualizó", status_changed: "cambió el estado de", deleted: "eliminó", access_changed: "cambió el acceso de" };
const entityNames: Record<string, string> = { idea: "la idea", project: "el proyecto", task: "la tarea", requirement: "el requisito", comment: "un comentario", technology: "la tecnología", decision: "la decisión", diagram: "el diagrama", project_member: "una persona del proyecto" };
const projectColors = ["bg-pastel-sky", "bg-pastel-lavender", "bg-pastel-mint"];

function timeAgo(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta)) return "";
  const minutes = Math.max(1, Math.floor(delta / 60_000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

export function WorkspaceOverview({
  workspaceId,
  workspaceName,
  userId,
  userName,
  canEdit,
  activeIdeaCount,
  ideas,
  projects,
  tasks,
  decisions,
  activity,
  profileNames,
}: {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  userName: string;
  canEdit: boolean;
  activeIdeaCount: number;
  ideas: Idea[];
  projects: Project[];
  tasks: Task[];
  decisions: Decision[];
  activity: ActivityEvent[];
  profileNames: Record<string, string>;
}) {
  const activeProjects = projects.filter((project) => !["published", "archived"].includes(project.stage));
  const pendingTasks = tasks.filter((task) => ["todo", "in_progress"].includes(task.status));
  const assignedToMe = pendingTasks.filter((task) => task.assignee_id === userId).length;
  const proposedDecisions = decisions.filter((decision) => decision.status === "proposed").length;
  const totalActiveTasks = tasks.filter((task) => task.status !== "archived");
  const completedTasks = totalActiveTasks.filter((task) => task.status === "done").length;
  const taskProgress = totalActiveTasks.length ? Math.round(completedTasks / totalActiveTasks.length * 100) : 0;
  const unclassifiedIdeas = ideas.filter((idea) => !idea.kind || idea.kind === "undecided").length;
  const greeting = new Date().getHours() < 12 ? "Buenos días" : new Date().getHours() < 19 ? "Buenas tardes" : "Buenas noches";

  return <main className="workspace-canvas">
    <section className="flex flex-col gap-7">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <Badge className="workspace-kicker mb-4 gap-2 bg-secondary text-secondary-foreground"><span className="size-2 rounded-full bg-primary" /> Espacio activo · {workspaceName}</Badge>
          <h1 className="workspace-title">{greeting}, {userName.split(" ")[0]} <span className="inline-block origin-bottom transition-transform duration-300 hover:rotate-12">👋</span></h1>
          <p className="workspace-subtitle mt-3">Aquí tienes el pulso de tus ideas y el avance de tu equipo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" render={<Link href={route(workspaceId, "ideas")} />}><ListTodo data-icon="inline-start" aria-hidden /> Filtros rápidos</Button>
          {canEdit && <CreateIdeaDialog workspaceId={workspaceId} buttonLabel="Capturar nueva idea" />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard tone="mint" label="Ideación" title="Ideas activas" value={activeIdeaCount} detail={`${unclassifiedIdeas} sin clasificar`} icon={<Lightbulb aria-hidden />} href={route(workspaceId, "ideas")} />
        <MetricCard tone="lavender" label="En curso" title="Proyectos activos" value={activeProjects.length} detail={`${taskProgress}% de tareas completadas`} icon={<FolderKanban aria-hidden />} href={route(workspaceId, "projects")} progress={taskProgress} />
        <MetricCard tone="peach" label="Backlog" title="Tareas pendientes" value={pendingTasks.length} detail={`${assignedToMe} asignadas a ti`} icon={<CheckCircle2 aria-hidden />} href={route(workspaceId, "projects")} />
        <MetricCard tone="sky" label="Gobernanza" title="ADR propuestos" value={proposedDecisions} detail={proposedDecisions ? "Pendientes de decisión" : "Sin decisiones pendientes"} icon={<Scale aria-hidden />} href={route(workspaceId, "projects")} />
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="recent-ideas-heading">
        <SectionHeading id="recent-ideas-heading" icon={<Lightbulb aria-hidden />} title="Bandeja de ideas recientes" badge={unclassifiedIdeas ? `${unclassifiedIdeas} sin clasificar` : undefined} href={route(workspaceId, "ideas")} linkText="Ver todas las ideas" />
        {ideas.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {ideas.slice(0, 3).map((idea, index) => <Card key={idea.id} className="group border-0 bg-card shadow-[0_8px_35px_rgb(45_43_91/0.055)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_45px_rgb(45_43_91/0.10)]">
            <CardContent className="flex h-full flex-col gap-4 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <Badge variant="secondary" className={cn("font-medium", ["bg-pastel-mint", "bg-pastel-lavender", "bg-pastel-sky"][index])}>{kindNames[idea.kind ?? "undecided"]}</Badge>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3.5" aria-hidden />{timeAgo(idea.created_at)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 text-lg font-semibold leading-snug tracking-tight"><Link href={`/ideas/${idea.id}?workspace=${workspaceId}`} className="transition-colors group-hover:text-primary">{idea.title}</Link></h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{idea.description || "Sin notas por ahora; abre la idea para desarrollarla."}</p>
              </div>
              <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pastel-lavender text-[0.65rem] font-semibold text-foreground/75">{initials(profileNames[idea.author_id] ?? "Miembro")}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{profileNames[idea.author_id] ?? "Miembro"}</span><span className="text-xs text-muted-foreground">Idea del espacio</span></span>
              </div>
              {canEdit && <div className="flex flex-wrap items-center gap-2">
                {idea.status === "active" && <ConvertIdeaDialog ideaId={idea.id} ideaTitle={idea.title} ideaDescription={idea.description} suggestedKind={idea.kind} workspaceName={workspaceName} leaderName={userName} />}
                <Button size="sm" variant="secondary" render={<Link href={`/ideas/${idea.id}?workspace=${workspaceId}`} />}>Madurar</Button>
              </div>}
            </CardContent>
          </Card>)}
        </div> : <Card className="border-dashed bg-card/65"><CardContent className="flex flex-col items-center gap-3 py-10 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-pastel-mint"><Lightbulb aria-hidden /></span><h3 className="font-semibold">Todavía no hay ideas</h3><p className="max-w-md text-sm text-muted-foreground">Captura una posibilidad y deja que el equipo la convierta en algo concreto.</p>{canEdit && <CreateIdeaDialog workspaceId={workspaceId} />}</CardContent></Card>}
      </section>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,0.8fr)]">
        <section className="flex flex-col gap-4" aria-labelledby="active-projects-heading">
          <SectionHeading id="active-projects-heading" icon={<FolderKanban aria-hidden />} title="Proyectos activos y progreso" href={route(workspaceId, "projects")} linkText="Ver proyectos" />
          {activeProjects.length ? <div className="flex flex-col gap-3">{activeProjects.slice(0, 4).map((project, index) => {
            const projectTasks = tasks.filter((task) => task.project_id === project.id && task.status !== "archived");
            const done = projectTasks.filter((task) => task.status === "done").length;
            const percent = projectTasks.length ? Math.round(done / projectTasks.length * 100) : 0;
            return <Card key={project.id} className="border-0 shadow-[0_8px_35px_rgb(45_43_91/0.055)] transition-shadow hover:shadow-[0_14px_40px_rgb(45_43_91/0.09)]">
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link href={`/projects/${project.id}`} className="flex min-w-0 items-center gap-3 group/project">
                    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", projectColors[index % projectColors.length])}><FolderKanban className="size-5 text-primary" aria-hidden /></span>
                    <span className="min-w-0"><span className="block truncate font-semibold group-hover/project:text-primary">{project.title}</span><span className="mt-0.5 block line-clamp-1 text-xs text-muted-foreground">{project.objective || "Aún falta definir el objetivo"}</span></span>
                  </Link>
                  <Badge variant="secondary" className={cn("shrink-0", project.stage === "development" ? "bg-pastel-mint" : project.stage === "planning" ? "bg-pastel-lavender" : "bg-pastel-sky")}>{stageNames[project.stage] ?? project.stage}</Badge>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3 text-xs"><span className="inline-flex items-center gap-1.5 text-muted-foreground"><CheckCircle2 className="size-3.5" aria-hidden />{done} de {projectTasks.length} tareas terminadas</span><span className="font-semibold tabular-nums text-primary">{percent}%</span></div>
                <Progress value={percent} aria-label={`Avance de tareas de ${project.title}`} className="mt-2 [&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-track]]:bg-secondary [&_[data-slot=progress-indicator]]:rounded-full" />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground"><span>Responsable · {profileNames[project.creator_id] ?? "Creador"}</span><Link href={`/projects/${project.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Abrir proyecto <ArrowUpRight className="size-3.5" aria-hidden /></Link></div>
              </CardContent>
            </Card>;
          })}</div> : <Card className="border-dashed bg-card/65"><CardContent className="flex flex-col items-center gap-3 py-10 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-pastel-sky"><FolderKanban aria-hidden /></span><h3 className="font-semibold">Aún no hay proyectos activos</h3><p className="max-w-md text-sm text-muted-foreground">Cuando conviertas una idea, aquí verás su avance real.</p><Button variant="outline" render={<Link href={route(workspaceId, "ideas")} />}>Explorar ideas</Button></CardContent></Card>}
        </section>

        <aside className="flex flex-col gap-4">
          <SectionHeading id="activity-heading" icon={<BellRing aria-hidden />} title="Actividad reciente" href={route(workspaceId, "activity")} linkText="Ver todo" />
          <Card className="border-0 shadow-[0_8px_35px_rgb(45_43_91/0.055)]"><CardContent className="flex flex-col gap-4 p-5">
            {activity.length ? activity.slice(0, 4).map((event, index) => {
              const actor = event.actor_id ? profileNames[event.actor_id] ?? "Un miembro" : "El sistema";
              const project = event.project_id ? projects.find((item) => item.id === event.project_id) : null;
              return <article key={event.id} className="relative flex gap-3">
                <span className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full", ["bg-pastel-lavender", "bg-pastel-sky", "bg-pastel-mint", "bg-pastel-peach"][index])}><Activity className="size-4" aria-hidden /></span>
                <div className="min-w-0 flex-1 pb-2"><p className="text-sm leading-5"><strong className="font-semibold">{actor}</strong> {actionNames[event.action] ?? event.action} {entityNames[event.entity_type] ?? event.entity_type}{event.metadata.label ? <> <span className="font-medium">“{event.metadata.label}”</span></> : null}.</p><p className="mt-1 truncate text-xs text-muted-foreground">{project ? `En ${project.title} · ` : "En el espacio · "}{timeAgo(event.created_at)}</p></div>
              </article>;
            }) : <div className="flex flex-col items-center py-6 text-center"><Activity className="mb-3 size-7 text-muted-foreground" aria-hidden /><p className="text-sm font-medium">Aún no hay actividad</p><p className="mt-1 text-xs text-muted-foreground">Los cambios del equipo aparecerán aquí.</p></div>}
            {activity.length > 4 && <Button variant="secondary" size="sm" render={<Link href={route(workspaceId, "activity")} />}>Ver historial completo <ArrowRight data-icon="inline-end" aria-hidden /></Button>}
          </CardContent></Card>

          <Card className="border-0 bg-pastel-lavender/70 shadow-[0_8px_35px_rgb(45_43_91/0.045)]"><CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2 text-primary"><Sparkles className="size-4" aria-hidden /><p className="text-sm font-semibold">Siguiente paso</p></div>
            <p className="text-sm leading-6 text-foreground/80">{activeIdeaCount > 0 ? <>Tienes <strong>{activeIdeaCount} ideas</strong> en la bandeja. Madura una y conviértela cuando el equipo esté listo para planificar.</> : <>Captura una idea y organiza con tu equipo el primer paso del proyecto.</>}</p>
            <Link href={route(workspaceId, activeIdeaCount ? "ideas" : "projects")} className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">{activeIdeaCount ? "Revisar ideas" : "Ver proyectos"}<ArrowRight className="size-4" aria-hidden /></Link>
          </CardContent></Card>

          <Card className="border border-border/60 bg-card/75 shadow-none"><CardContent className="flex items-center gap-3 p-4"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Users className="size-5" aria-hidden /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">Un espacio, un equipo</p><p className="text-xs text-muted-foreground">Coordina tareas y decisiones en {workspaceName}.</p></div><Button variant="ghost" size="icon-sm" aria-label="Ver equipo" render={<Link href={route(workspaceId, "team")} />}><CircleHelp aria-hidden /></Button></CardContent></Card>
        </aside>
      </div>
    </section>
  </main>;
}

function MetricCard({ tone, label, title, value, detail, icon, href, progress }: {
  tone: "mint" | "lavender" | "peach" | "sky";
  label: string;
  title: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  href: string;
  progress?: number;
}) {
  const color = { mint: "bg-pastel-mint/80", lavender: "bg-pastel-lavender/80", peach: "bg-pastel-peach/75", sky: "bg-pastel-sky/75" }[tone];
  return <Link href={href} className="group rounded-[1.65rem] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <Card className={cn("metric-card h-full min-h-48 border-0 shadow-[0_8px_35px_rgb(45_43_91/0.045)] transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_14px_40px_rgb(45_43_91/0.09)]", color)}>
      <CardContent className="flex h-full flex-col justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-card text-primary shadow-sm">{icon}</span><Badge variant="secondary" className="bg-card/80 text-[0.65rem] font-semibold uppercase tracking-wider">{label}</Badge></div>
        <div><p className="font-heading text-4xl font-light tabular-nums tracking-tight">{value}</p><p className="mt-1 font-medium">{title}</p></div>
        <div className="flex min-h-5 items-center justify-between gap-2 text-xs text-muted-foreground"><span className="inline-flex min-w-0 items-center gap-1.5 truncate">{progress !== undefined ? <TrendingUp className="size-3.5 shrink-0 text-primary" aria-hidden /> : <span className="size-1.5 shrink-0 rounded-full bg-primary/70" />}{detail}</span>{progress !== undefined && <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-card/80"><span className="block h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></span>}</div>
      </CardContent>
    </Card>
  </Link>;
}

function SectionHeading({ id, icon, title, badge, href, linkText }: { id: string; icon: React.ReactNode; title: string; badge?: string; href: string; linkText: string }) {
  return <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-2.5"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">{icon}</span><h2 id={id} className="truncate font-heading text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>{badge && <Badge variant="secondary" className="hidden sm:inline-flex">{badge}</Badge>}</div>
    <Link href={href} className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/75">{linkText}<ArrowRight className="size-4" aria-hidden /></Link>
  </div>;
}
