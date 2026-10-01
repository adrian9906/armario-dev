import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "cn";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, CheckCircle2, Circle, ClipboardList, FolderKanban, Lightbulb, ListTodo, Plus, ShieldCheck, UserRoundPlus, Users } from "lucide-react";
import { moveTask } from "@/app/projects/actions";
import { removeProjectMember } from "@/app/projects/access-actions";
import { ProjectMemberForm, ProjectVisibilityForm } from "@/components/project-access-forms";
import { ProjectSettingsForm } from "@/components/project-forms";
import { ProjectGitHubRepository } from "@/components/project-github-repository";
import { ProjectGitHubActivity } from "@/components/project-github-activity";
import { ProjectGitHubAutomations } from "@/components/project-github-automations";
import { ProjectGitHubPullRequests } from "@/components/project-github-pull-requests";
import { ArchitectureWorkspace } from "@/components/architecture-workspace";
import { ProjectKanbanBoard } from "@/components/project-kanban-board";
import { EditTaskDialog, TaskCompletionToggle } from "@/components/task-card-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { moduleOptions, projectKinds, projectProgress, projectStages, requirementCoverage, taskPriorities, taskStatuses, type ProjectModules } from "@/lib/project-model";
import { requireProjectAccess } from "@/lib/project-access";
import { canAssignProjectMember } from "@/lib/project-permissions";
import { getGitHubWebhookSecret } from "@/lib/github/env";

export const dynamic = "force-dynamic";
type Task = { id: string; title: string; description: string; status: string; priority: string; assignee_id: string | null; start_date: string | null; due_date: string | null; position: number };
type ChecklistItem = { task_id: string; completed_at: string | null };
type Requirement = { id: string; title: string; description: string; acceptance_criteria: string; kind: string; priority: string; status: string };
type LinkRow = { task_id: string; requirement_id: string };
type Technology = { id: string; name: string; category: string; status: string; version: string; rationale: string };
type Decision = { id: string; title: string; status: string; decided_at: string; context: string; decision: string; consequences: string };
type Diagram = { id: string; title: string; kind: string; source: string; status: string; updated_at: string };
type WorkspaceMember = { user_id: string; role: string };
type ProjectMember = { user_id: string; role: string };
const label = (choices: readonly { value: string; label: string }[], value: string) => choices.find((choice) => choice.value === value)?.label ?? value;
const formatDate = (value: string) => new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
const taskDates = (start: string | null, end: string | null) => start && end
  ? ` · ${formatDate(start)} – ${formatDate(end)}`
  : end ? ` · vence ${formatDate(end)}` : "";
const projectRoleNames: Record<string, string> = { manager: "Administrador", editor: "Editor", contributor: "Colaborador", viewer: "Lector" };
const visibilityNames: Record<string, string> = { workspace: "Todo el espacio", private: "Privado", restricted: "Personas elegidas" };
const projectTabs = [
  { value: "overview", label: "Resumen" },
  { value: "board", label: "Tablero Kanban" },
  { value: "tasks", label: "Lista de tareas" },
  { value: "documentation", label: "Definición & Arquitectura" },
  { value: "github", label: "GitHub" },
  { value: "people", label: "Personas" },
] as const;

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; section?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const viewParam = query.view;
  const view = viewParam === "requirements" ? "documentation" : ["overview", "tasks", "board", "requirements", "documentation", "github", "people", "settings"].includes(viewParam ?? "") ? viewParam! : "overview";
  const validArchitectureSections = ["requirements", "diagrams", "technologies", "decisions"] as const;
  const architectureSection = viewParam === "requirements" ? "requirements" : validArchitectureSections.includes(query.section as typeof validArchitectureSections[number]) ? query.section as typeof validArchitectureSections[number] : "diagrams";
  const access = await requireProjectAccess(id);
  const { db, userId, canEdit, canManage, role: projectRole, project: accessProject } = access;
  const { data: project } = await db.from("projects")
    .select("id,workspace_id,origin_idea_id,origin_snapshot,creator_id,title,objective,kind,stage,modules,visibility,created_at")
    .eq("id", id).maybeSingle();
  if (!project) notFound();
  const [{ data: space }, tasksResult, requirementsResult, linksResult, checklistResult, membersResult, technologiesResult, decisionsResult, diagramsResult, projectMembersResult, githubInstallationResult, projectRepositoryResult, automationSettingsResult, githubTaskLinksResult, automationEventsResult] = await Promise.all([
    db.from("workspaces").select("name").eq("id", project.workspace_id).maybeSingle(),
    db.from("tasks").select("id,title,description,status,priority,assignee_id,start_date,due_date,position").eq("project_id", id).order("position"),
    db.from("requirements").select("id,title,description,acceptance_criteria,kind,priority,status").eq("project_id", id).order("position").order("created_at"),
    db.from("task_requirements").select("task_id,requirement_id").eq("project_id", id),
    db.from("checklist_items").select("task_id,completed_at").eq("project_id", id),
    db.from("workspace_memberships").select("user_id,role").eq("workspace_id", project.workspace_id),
    db.from("project_technologies").select("id,name,category,status,version,rationale").eq("project_id", id).order("category").order("created_at"),
    db.from("architecture_decisions").select("id,title,status,decided_at,context,decision,consequences").eq("project_id", id).order("decided_at", { ascending: false }),
    db.from("project_diagrams").select("id,title,kind,source,status,updated_at").eq("project_id", id).order("updated_at", { ascending: false }),
    db.from("project_memberships").select("user_id,role").eq("project_id", id).order("created_at"),
    db.from("github_installations").select("account_login,status").eq("workspace_id", project.workspace_id).eq("status", "active").maybeSingle(),
    db.from("project_repositories").select("full_name,description,html_url,clone_url,ssh_url,default_branch,visibility,archived,last_synced_at").eq("project_id", id).maybeSingle(),
    db.from("github_automation_settings").select("task_issue_enabled,task_branch_enabled,task_pr_enabled,pr_merge_completes_task,issue_state_sync,document_publish_enabled,notifications_enabled,branch_prefix").eq("project_id", id).maybeSingle(),
    db.from("github_task_links").select("task_id,issue_number,issue_url,branch_name,pull_request_number,pull_request_url,pull_request_state,last_origin,last_event").eq("project_id", id).order("updated_at", { ascending: false }),
    db.from("github_automation_events").select("id,origin,event,status,summary,created_at").eq("project_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (!space) notFound();
  const tasks = (tasksResult.data ?? []) as Task[];
  const requirements = (requirementsResult.data ?? []) as Requirement[];
  const links = (linksResult.data ?? []) as LinkRow[];
  const checklistItems = (checklistResult.data ?? []) as ChecklistItem[];
  const technologies = (technologiesResult.data ?? []) as Technology[];
  const decisions = (decisionsResult.data ?? []) as Decision[];
  const diagrams = (diagramsResult.data ?? []) as Diagram[];
  const activeDiagrams = diagrams.filter((diagram) => diagram.status === "active");
  const activeTasks = tasks.filter((task) => task.status !== "archived");
  const activeRequirements = requirements.filter((requirement) => requirement.status === "active");
  const progress = projectProgress(tasks);
  const workspaceMembers = (membersResult.data ?? []) as WorkspaceMember[];
  const projectMembers = (projectMembersResult.data ?? []) as ProjectMember[];
  const automationSettings = automationSettingsResult.data ?? {
    task_issue_enabled: false, task_branch_enabled: false, task_pr_enabled: false,
    pr_merge_completes_task: false, issue_state_sync: false, document_publish_enabled: false,
    notifications_enabled: true, branch_prefix: "task",
  };
  const memberIds = workspaceMembers.map((member) => member.user_id);
  const profilesResult = memberIds.length ? await db.from("profiles").select("id,display_name").in("id", memberIds) : { data: [], error: null };
  const names = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.display_name]));
  const error = tasksResult.error || requirementsResult.error || linksResult.error || checklistResult.error || membersResult.error || profilesResult.error
    || technologiesResult.error || decisionsResult.error || diagramsResult.error || projectMembersResult.error
    || githubInstallationResult.error || projectRepositoryResult.error || automationSettingsResult.error
    || githubTaskLinksResult.error || automationEventsResult.error;
  const modules = project.modules as ProjectModules;
  const snapshot = project.origin_snapshot as { title?: string; description?: string; author_id?: string; created_at?: string } | null;
  const selectableMembers = workspaceMembers
    .filter((member) => member.user_id !== project.creator_id && !["owner", "admin"].includes(member.role))
    .map((member) => ({ user_id: member.user_id, name: names.get(member.user_id) || "Miembro" }));
  const explicitMemberIds = new Set(projectMembers.map((member) => member.user_id));
  const taskMembers = workspaceMembers
    .filter((member) => canAssignProjectMember(accessProject, member, explicitMemberIds))
    .map((member) => ({ user_id: member.user_id, name: names.get(member.user_id) || "Miembro" }));
  const projectAccessMemberIds = workspaceMembers.filter((member) => project.visibility === "workspace"
    || member.user_id === project.creator_id || ["owner", "admin"].includes(member.role)
    || (project.visibility === "restricted" && explicitMemberIds.has(member.user_id))).map((member) => member.user_id);

  return <main className="workspace-canvas">
    <Link href={`/dashboard?workspace=${project.workspace_id}&view=projects`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a {space.name}</Link>
    <div className="mt-8 flex flex-wrap items-end justify-between gap-5"><div><Badge className="workspace-kicker mb-5 bg-pastel-mint">{label(projectStages, project.stage)}</Badge><h1 className="workspace-title">{project.title}</h1><p className="workspace-subtitle mt-4">{label(projectKinds, project.kind)} · creado el {formatDate(project.created_at)} · responsable: {names.get(project.creator_id) || "Creador"}</p></div>{canEdit && !["settings", "people", "github", "board"].includes(view) && <Button render={<Link href={`/projects/${id}/tasks/new`} />}><Plus aria-hidden /> Nueva tarea</Button>}</div>
    <nav aria-label="Secciones del proyecto" className="mt-8 flex gap-1 overflow-x-auto rounded-[1.4rem] bg-card p-2 shadow-[0_10px_35px_rgb(45_43_91/0.06)] ring-1 ring-foreground/6">
      {projectTabs.map((tab) => <Link key={tab.value} href={`/projects/${id}?view=${tab.value}`} className={cn("shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors", view === tab.value ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{tab.label}</Link>)}
      {canEdit && <Link href={`/projects/${id}?view=settings`} className={cn("shrink-0 rounded-full px-4 py-2.5 text-sm font-medium transition-colors", view === "settings" ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>Configuración</Link>}
    </nav>
    {error && <Card className="mt-6 border-destructive"><CardContent><p role="alert" className="text-sm text-destructive">No se pudieron cargar todos los datos. Actualiza para volver a intentarlo.</p></CardContent></Card>}
    {view === "overview" && <section className="mt-7 flex flex-col gap-6">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="metric-card border-0 bg-pastel-lavender"><CardHeader><CardDescription className="font-semibold text-foreground/70">Avance total</CardDescription><CardTitle className="metric-value">{progress.percent}%</CardTitle></CardHeader><CardContent><Progress value={progress.percent} /><p className="mt-3 text-xs text-foreground/65">{progress.completed} de {progress.total} tareas</p></CardContent></Card>
        <Card className="metric-card border-0 bg-pastel-sky"><CardHeader><CardDescription className="font-semibold text-foreground/70">Tareas activas</CardDescription><CardTitle className="metric-value">{activeTasks.length}</CardTitle></CardHeader><CardContent><ListTodo className="size-5" aria-hidden /></CardContent></Card>
        <Card className="metric-card border-0 bg-pastel-mint"><CardHeader><CardDescription className="font-semibold text-foreground/70">Requisitos</CardDescription><CardTitle className="metric-value">{activeRequirements.length}</CardTitle></CardHeader><CardContent><ClipboardList className="size-5" aria-hidden /></CardContent></Card>
        <Card className="metric-card border-0 bg-pastel-peach"><CardHeader><CardDescription className="font-semibold text-foreground/70">Equipo</CardDescription><CardTitle className="metric-value">{projectAccessMemberIds.length}</CardTitle></CardHeader><CardContent><Users className="size-5" aria-hidden /></CardContent></Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"><div className="flex flex-col gap-6"><Card className="content-panel"><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender"><FolderKanban aria-hidden /></div><CardTitle>Objetivo</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-base leading-7 text-foreground/80">{project.objective || "Todavía no hay un objetivo. Añádelo en la configuración del proyecto."}</p></CardContent></Card><Card className="content-panel"><CardHeader><CardTitle>Trabajo en marcha</CardTitle><CardDescription>{progress.completed} de {progress.total} tareas completadas</CardDescription></CardHeader><CardContent><div className="mb-5 flex items-center gap-3"><Progress value={progress.percent} className="flex-1" /><span className="text-sm font-semibold">{progress.percent}%</span></div><div className="flex flex-col gap-3">{activeTasks.slice(0, 4).map((task) => <Link key={task.id} href={`/projects/${id}/tasks/${task.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 p-3 text-sm hover:bg-accent"><span className="flex items-center gap-2">{task.status === "done" ? <CheckCircle2 className="size-4 text-primary" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}{task.title}</span><ArrowRight className="size-4 shrink-0" aria-hidden /></Link>)}{!activeTasks.length && <p className="text-sm text-muted-foreground">Aún no hay tareas. Divide el objetivo en pasos concretos.</p>}</div></CardContent></Card><Card className="content-panel"><CardHeader><CardTitle>Requisitos</CardTitle><CardDescription>Vincula tareas para ver la cobertura de cada necesidad.</CardDescription></CardHeader><CardContent><div className="flex flex-col gap-3">{activeRequirements.slice(0, 4).map((requirement) => { const coverage = requirementCoverage(requirement.id, links, tasks); return <Link key={requirement.id} href={`/projects/${id}/requirements/${requirement.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 p-3 text-sm hover:bg-accent"><span className="truncate">{requirement.title}</span><Badge variant="outline">{coverage.total ? `${coverage.completed}/${coverage.total}` : "Sin tareas"}</Badge></Link>; })}{!activeRequirements.length && <p className="text-sm text-muted-foreground">Define los requisitos para conectar el trabajo con el propósito.</p>}</div></CardContent></Card></div><div className="flex flex-col gap-6"><Card className="content-panel"><CardHeader><CardTitle>Configuración técnica</CardTitle><CardDescription>Los módulos pueden evolucionar con el proyecto.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{moduleOptions.map((module) => <Badge key={module.value} variant={modules[module.value] ? "default" : "outline"}>{module.label}: {modules[module.value] ? "Sí" : "No"}</Badge>)}</CardContent></Card><Card className="content-panel"><CardHeader><CardTitle>Equipo</CardTitle><CardDescription>{projectAccessMemberIds.length} personas con acceso</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{projectAccessMemberIds.slice(0, 8).map((memberId) => <Badge variant="secondary" key={memberId}>{names.get(memberId) || "Miembro"}</Badge>)}</CardContent></Card>{project.origin_idea_id && <Card className="content-panel"><CardHeader><div className="flex items-center gap-2"><Lightbulb className="size-5" aria-hidden /><CardTitle>Idea de origen</CardTitle></div><CardDescription>{snapshot?.title || "Idea inicial"}</CardDescription></CardHeader><CardContent><p className="mb-4 line-clamp-3 text-sm text-muted-foreground">{snapshot?.description || "Sin notas iniciales"}</p><Button variant="outline" render={<Link href={`/ideas/${project.origin_idea_id}`} />}>Ver idea original</Button></CardContent></Card>}</div></div>
    </section>}
    {view === "tasks" && <section className="mt-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold tracking-tight">Lista de tareas</h2><p className="text-sm text-muted-foreground">Marca lo terminado desde la tarjeta y abre cada tarea para ver su checklist y comentarios.</p></div>{canEdit && <Button render={<Link href={`/projects/${id}/tasks/new`} />}><Plus aria-hidden /> Crear tarea</Button>}</div>
      {activeTasks.length ? <div className="flex flex-col gap-3">{activeTasks.map((task, index) => {
        const canToggle = canEdit || (projectRole === "contributor" && task.assignee_id === userId);
        return <Card key={task.id} size="sm"><CardContent className="flex flex-wrap items-center gap-4">
          <TaskCompletionToggle projectId={id} task={task} canToggle={canToggle} className="min-w-0 flex-1">
            <Link href={`/projects/${id}/tasks/${task.id}`} className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span data-task-title className="font-medium">{task.title}</span><Badge variant="outline">{label(taskStatuses, task.status)}</Badge><Badge variant="secondary">{label(taskPriorities, task.priority)}</Badge></div><p className="mt-2 text-sm text-muted-foreground">{task.assignee_id ? names.get(task.assignee_id) || "Miembro" : "Sin asignar"}{taskDates(task.start_date, task.due_date)}</p></Link>
          </TaskCompletionToggle>
          {canEdit && <div className="flex flex-wrap items-center gap-1"><EditTaskDialog projectId={id} task={task} members={taskMembers} /><form action={moveTask}><input type="hidden" name="project_id" value={id} /><input type="hidden" name="task_id" value={task.id} /><input type="hidden" name="direction" value="up" /><Button type="submit" size="icon-sm" variant="outline" disabled={index === 0} aria-label={`Subir ${task.title}`}><ArrowUp aria-hidden /></Button></form><form action={moveTask}><input type="hidden" name="project_id" value={id} /><input type="hidden" name="task_id" value={task.id} /><input type="hidden" name="direction" value="down" /><Button type="submit" size="icon-sm" variant="outline" disabled={index === activeTasks.length - 1} aria-label={`Bajar ${task.title}`}><ArrowDown aria-hidden /></Button></form></div>}
        </CardContent></Card>;
      })}</div> : <EmptyWork icon={<ListTodo aria-hidden />} title="Aún no hay tareas" description="Crea la primera tarea y divide el objetivo en pasos." />}
      {tasks.some((task) => task.status === "archived") && <div className="mt-8"><h3 className="mb-3 text-sm font-semibold">Archivadas</h3>{tasks.filter((task) => task.status === "archived").map((task) => <Link key={task.id} href={`/projects/${id}/tasks/${task.id}`} className="mb-2 block text-sm text-muted-foreground underline">{task.title}</Link>)}</div>}
    </section>}
    {view === "board" && <ProjectKanbanBoard
      projectId={id}
      initialTasks={activeTasks.map((task) => {
        const checklist = checklistItems.filter((item) => item.task_id === task.id);
        const taskRequirements = links.filter((item) => item.task_id === task.id).map((link) => requirements.find((item) => item.id === link.requirement_id)).filter((item): item is Requirement => Boolean(item));
        const gitLink = (githubTaskLinksResult.data ?? []).find((item) => item.task_id === task.id);
        return {
          ...task,
          canMove: canEdit || (projectRole === "contributor" && task.assignee_id === userId),
          checklistTotal: checklist.length,
          checklistCompleted: checklist.filter((item) => Boolean(item.completed_at)).length,
          requirements: taskRequirements.map((item) => ({ id: item.id, title: item.title })),
          branch: gitLink?.branch_name ?? null,
          pullRequestNumber: gitLink?.pull_request_number ?? null,
          pullRequestUrl: gitLink?.pull_request_url ?? null,
        };
      })}
      members={projectAccessMemberIds.map((memberId) => ({ user_id: memberId, name: names.get(memberId) || "Miembro", role: projectRoleNames[projectMembers.find((item) => item.user_id === memberId)?.role ?? ""] ?? workspaceMembers.find((item) => item.user_id === memberId)?.role ?? "Miembro" }))}
      memberOptions={workspaceMembers.map((member) => ({ user_id: member.user_id, name: names.get(member.user_id) || "Miembro" }))}
      taskMembers={taskMembers}
      roleLabels={{ ...projectRoleNames, owner: "Propietario", admin: "Admin", editor: "Editor", contributor: "Colaborador", viewer: "Lector" }}
      canEdit={canEdit}
    />}
    {view === "documentation" && <ArchitectureWorkspace projectId={id} projectTitle={project.title} canEdit={canEdit} section={architectureSection} requirements={requirements} tasks={tasks.map((task) => ({ id: task.id, title: task.title, status: task.status }))} links={links} technologies={technologies} decisions={decisions} diagrams={diagrams} />}
    {view === "github" && <section className="mt-7 flex flex-col gap-6">
      <div><h2 className="text-2xl font-bold tracking-tight">Repositorio del proyecto</h2><p className="mt-1 text-base text-muted-foreground">Conecta el código de GitHub con el trabajo, la documentación y las próximas automatizaciones de Armario Dev.</p></div>
      <ProjectGitHubRepository
        projectId={id}
        workspaceId={project.workspace_id}
        projectTitle={project.title}
        accountLogin={githubInstallationResult.data?.account_login ?? null}
        connected={Boolean(githubInstallationResult.data)}
        canManage={canManage}
        repository={projectRepositoryResult.data}
      />
      {projectRepositoryResult.data && <ProjectGitHubActivity
        projectId={id}
        canManage={canManage}
        documents={[
          ...activeRequirements.map((requirement) => ({ value: `requirement:${requirement.id}`, type: "Requisito", title: requirement.title })),
          ...decisions.map((decision) => ({ value: `decision:${decision.id}`, type: "ADR", title: decision.title })),
          ...activeDiagrams.map((diagram) => ({ value: `diagram:${diagram.id}`, type: "Diagrama", title: diagram.title })),
        ]}
      />}
      {projectRepositoryResult.data && <ProjectGitHubAutomations
        projectId={id}
        canManage={canManage}
        webhookConfigured={Boolean(getGitHubWebhookSecret())}
        settings={automationSettings}
        tasks={tasks.map((task) => ({ id: task.id, title: task.title, status: task.status }))}
        links={githubTaskLinksResult.data ?? []}
        events={automationEventsResult.data ?? []}
      />}
      {projectRepositoryResult.data && <ProjectGitHubPullRequests projectId={id} canManage={canManage} />}
    </section>}
    {view === "people" && <section className="mt-7"><div className="mb-6"><h2 className="text-2xl font-bold tracking-tight">Personas y acceso</h2><p className="mt-1 text-base text-muted-foreground">Controla quién puede abrir este proyecto y qué puede hacer.</p></div><div className="grid gap-6 lg:grid-cols-[1.25fr_0.85fr]"><div className="space-y-6"><Card><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-mint"><Users aria-hidden /></div><CardTitle>Acceso efectivo</CardTitle><CardDescription>Tu rol: {projectRoleNames[projectRole]} · visibilidad: {visibilityNames[project.visibility]}</CardDescription></CardHeader><CardContent className="space-y-3"><PersonRow name={names.get(project.creator_id) || "Responsable"} detail="Responsable · Administrador" />{workspaceMembers.filter((member) => ["owner", "admin"].includes(member.role) && member.user_id !== project.creator_id).map((member) => <PersonRow key={member.user_id} name={names.get(member.user_id) || "Miembro"} detail="Administración del espacio · acceso permanente" />)}{project.visibility === "restricted" && projectMembers.filter((member) => member.user_id !== project.creator_id && !workspaceMembers.some((workspaceMember) => workspaceMember.user_id === member.user_id && ["owner", "admin"].includes(workspaceMember.role))).map((member) => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 p-4"><div><p className="text-sm font-semibold">{names.get(member.user_id) || "Miembro"}{member.user_id === userId ? " (tú)" : ""}</p><p className="text-xs text-muted-foreground">{projectRoleNames[member.role]}</p></div>{canManage && <form action={removeProjectMember}><input type="hidden" name="project_id" value={id} /><input type="hidden" name="user_id" value={member.user_id} /><Button type="submit" size="sm" variant="destructive">Retirar</Button></form>}</div>)}{project.visibility === "workspace" && <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Las demás personas heredan su acceso desde el espacio.</p>}{project.visibility === "private" && <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Solo la persona responsable y la administración del espacio pueden entrar.</p>}{project.visibility !== "restricted" && projectMembers.length > 0 && <p className="text-xs text-muted-foreground">Hay {projectMembers.length} accesos guardados que se activarán al elegir “Personas elegidas”.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Qué permite cada rol</CardTitle></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><AccessRole icon={<ShieldCheck aria-hidden />} title="Administrador" text="Configura acceso y edita todo." /><AccessRole icon={<BookOpen aria-hidden />} title="Editor" text="Crea y edita trabajo y documentación." /><AccessRole icon={<UserRoundPlus aria-hidden />} title="Colaborador" text="Comenta y avanza sus tareas asignadas." /><AccessRole icon={<Users aria-hidden />} title="Lector" text="Consulta el proyecto sin modificarlo." /></CardContent></Card></div><div className="space-y-6">{canManage ? <><Card><CardHeader><CardTitle>Visibilidad</CardTitle><CardDescription>Todo el espacio, solo administradores o una lista concreta.</CardDescription></CardHeader><CardContent><ProjectVisibilityForm projectId={id} visibility={project.visibility} /></CardContent></Card>{project.visibility === "restricted" && selectableMembers.length > 0 && <Card><CardHeader><CardTitle>Añadir o cambiar acceso</CardTitle><CardDescription>Disponible para miembros actuales del espacio.</CardDescription></CardHeader><CardContent><ProjectMemberForm projectId={id} members={selectableMembers} /></CardContent></Card>}</> : <Card className="border-0 bg-pastel-sky/60"><CardHeader><ShieldCheck aria-hidden /><CardTitle>Acceso administrado</CardTitle><CardDescription>Solo los administradores del proyecto pueden cambiar la visibilidad y los roles.</CardDescription></CardHeader></Card>}</div></div></section>}
    {view === "settings" && canEdit && <Card className="mt-7 max-w-3xl"><CardHeader><CardTitle>Configurar proyecto</CardTitle><CardDescription>Cambia la etapa, objetivo, tipo o módulos sin borrar tareas ni requisitos.</CardDescription></CardHeader><CardContent><ProjectSettingsForm project={{ id, title: project.title, objective: project.objective, kind: project.kind, stage: project.stage, modules }} /></CardContent></Card>}
  </main>;
}

function EmptyWork({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <Card className="border-dashed"><CardContent className="flex flex-col items-center py-14 text-center"><span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-pastel-lavender">{icon}</span><h3 className="font-semibold">{title}</h3><p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p></CardContent></Card>;
}

function PersonRow({ name, detail }: { name: string; detail: string }) {
  return <div className="rounded-2xl border border-border/70 p-4"><p className="text-sm font-semibold">{name}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function AccessRole({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="rounded-2xl border border-border/70 p-4"><span className="mb-3 flex size-9 items-center justify-center rounded-xl bg-pastel-lavender">{icon}</span><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>;
}
