import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { Activity, ArrowRight, Archive, Bell, Check, FolderKanban, GitFork, Lightbulb, MessageCircle, Plus, UserRoundPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Brand } from "@/components/brand";
import { IdeaFiltersForm } from "@/components/idea-filters-form";
import { CreateIdeaDialog, IdeaCardActions } from "@/components/idea-dialogs";
import { RenameProfileForm, RenameWorkspaceForm } from "@/components/phase-one-forms";
import { NotificationPreferencesForm } from "@/components/notification-preferences-form";
import { markAllNotificationsRead, markNotificationRead } from "@/app/notification-actions";
import { DisconnectGitHubDialog } from "@/components/github-connection-actions";
import { WorkspaceOverview } from "@/components/workspace-overview";
import { WorkspaceMembersAdmin } from "@/components/workspace-members-admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Params = Promise<{ workspace?: string; view?: string; q?: string; status?: string; kind?: string }>;
type Space = { id: string; name: string; is_personal: boolean };
type Idea = { id: string; title: string; description: string; kind: string | null; status: string; tags: string[]; created_at: string; author_id: string };
type Project = { id: string; title: string; objective: string | null; kind: string; stage: string; created_at: string; creator_id: string };
type TaskSummary = { id: string; project_id: string; title: string; status: string; assignee_id: string | null };
type DecisionSummary = { id: string; status: string };
type Member = { user_id: string; role: string };
type ProjectMembership = { project_id: string; user_id: string; role: string };
type Invitation = { id: string; email: string; role: string; expires_at: string };
type PendingInvitation = { id: string; role: string; workspaceId: string; workspaceName: string };
type ActivityEvent = { id: string; actor_id: string | null; project_id: string | null; action: string; entity_type: string; metadata: { label?: string; status?: string; previous_status?: string; role?: string }; created_at: string };
type Notification = { id: string; type: string; title: string; body: string; href: string; read_at: string | null; created_at: string };
type GitHubInstallation = { installation_id: number; account_login: string; account_type: string; repository_selection: string; status: string };
const kindNames: Record<string, string> = { web: "Web", mobile: "Móvil", frontend: "Frontend", backend: "Backend", mixed: "Frontend y backend", other: "Otro", undecided: "Por definir" };
const roleNames: Record<string, string> = { owner: "Propietario", admin: "Administrador", editor: "Editor", viewer: "Lector" };
const stageNames: Record<string, string> = { definition: "Definición", planning: "Planificación", development: "Desarrollo", published: "Publicado", archived: "Archivado" };
const colors = ["bg-pastel-lavender", "bg-pastel-sky", "bg-pastel-peach", "bg-pastel-mint"];
const route = (id: string, view: string) => `/dashboard?workspace=${id}&view=${view}`;
const actionNames: Record<string, string> = { created: "creó", updated: "actualizó", status_changed: "cambió el estado de", deleted: "eliminó", access_changed: "cambió el acceso de" };
const entityNames: Record<string, string> = { idea: "la idea", project: "el proyecto", task: "la tarea", requirement: "el requisito", comment: "un comentario", technology: "la tecnología", decision: "la decisión", diagram: "el diagrama", project_member: "una persona del proyecto" };
const relativeDate = (value: string) => new Intl.DateTimeFormat("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(escapePattern);
  if (!terms.length) return text;
  const pattern = new RegExp(`(${terms.join("|")})`, "gi");
  const exact = new RegExp(`^(?:${terms.join("|")})$`, "i");
  return <>{text.split(pattern).map((part, index) => exact.test(part) ? <mark key={`${part}-${index}`} className="rounded-sm bg-highlight px-0.5 text-inherit box-decoration-clone">{part}</mark> : part)}</>;
}

export default async function DashboardPage({ searchParams }: { searchParams: Params }) {
  const { userId } = await auth.protect();
  const params = await searchParams;
  if (!getSupabaseConfig()) return <main className="mx-auto max-w-3xl p-8"><Brand /><Alert className="mt-8"><AlertTitle>Tu taller está casi listo</AlertTitle><AlertDescription>Revisa la URL y la clave publicable de Supabase en .env o .env.local.</AlertDescription></Alert></main>;

  const db = createClient();
  const ownProfileResponse = await db.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  let user = null;
  let name = ownProfileResponse.data?.display_name?.trim() || "";

  // Clerk is only needed to seed a profile once. A network failure must not make
  // the authenticated dashboard unavailable.
  if (!name) {
    try {
      user = await currentUser();
      name = user?.fullName || user?.firstName || "Creador";
    } catch {
      name = "Creador";
    }
  }

  const setup = await db.rpc("ensure_personal_workspace", { chosen_name: name });
  if (setup.error || ownProfileResponse.error) return <main className="mx-auto max-w-3xl p-8"><Brand /><Alert variant="destructive" className="mt-8"><AlertTitle>No se pudieron cargar los datos</AlertTitle><AlertDescription>Revisa la conexión entre Clerk y Supabase y actualiza la página.</AlertDescription></Alert></main>;

  const view = ["overview", "ideas", "projects", "activity", "notifications", "team"].includes(params.view ?? "") ? params.view! : "overview";
  let pendingInvitations: PendingInvitation[] = [];
  if (view === "team") {
    try {
      user ??= await currentUser();
      const verifiedEmails = user?.emailAddresses
        .filter((address) => address.verification?.status === "verified")
        .map((address) => address.emailAddress.toLowerCase()) ?? [];
      if (verifiedEmails.length) {
        const { data } = await createAdminClient().from("workspace_invitations")
          .select("id,role,workspace_id,workspaces(name)")
          .in("email", verifiedEmails)
          .eq("status", "pending")
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false });
        pendingInvitations = (data ?? []).map((invitation) => {
          const relatedWorkspace = invitation.workspaces as { name?: string } | { name?: string }[] | null;
          const workspaceName = Array.isArray(relatedWorkspace)
            ? relatedWorkspace[0]?.name
            : relatedWorkspace?.name;
          return {
            id: invitation.id,
            role: invitation.role,
            workspaceId: invitation.workspace_id,
            workspaceName: workspaceName ?? "Espacio invitado",
          };
        });
      }
    } catch {
      pendingInvitations = [];
    }
  }
  const [spacesResponse, rolesResponse] = await Promise.all([
    db.from("workspaces").select("id,name,is_personal").order("created_at"),
    db.from("workspace_memberships").select("workspace_id,role").eq("user_id", userId),
  ]);
  const spaces = (spacesResponse.data ?? []) as Space[];
  const space = spaces.find((item) => item.id === params.workspace) ?? spaces.find((item) => item.id === setup.data) ?? spaces[0];
  if (!space || spacesResponse.error || rolesResponse.error) return <main className="mx-auto max-w-3xl p-8"><Brand /><Alert variant="destructive" className="mt-8"><AlertTitle>No se pudieron cargar los espacios</AlertTitle><AlertDescription>Actualiza la página para reintentar.</AlertDescription></Alert></main>;
  const role = rolesResponse.data?.find((item) => item.workspace_id === space.id)?.role ?? "viewer";
  const canEdit = ["owner", "admin", "editor"].includes(role);
  const canManage = ["owner", "admin"].includes(role);
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";
  const status = ["active", "archived", "all"].includes(params.status ?? "") ? params.status! : "active";
  const kind = Object.keys(kindNames).includes(params.kind ?? "") ? params.kind! : "";
  const query = (params.q ?? "").trim().slice(0, 120);
  const [ideaResponse, ideaCount, projectResponse, memberResponse, inviteResponse, activityResponse, notificationsResponse, preferencesResponse, githubResponse, taskResponse, decisionResponse, projectMembershipResponse] = await Promise.all([
    db.rpc("search_workspace_ideas", { target_workspace_id: space.id, search_term: query, filter_status: status, filter_kind: kind }),
    db.from("ideas").select("id", { count: "exact", head: true }).eq("workspace_id", space.id).eq("status", "active"),
    db.from("projects").select("id,title,objective,kind,stage,created_at,creator_id").eq("workspace_id", space.id).order("created_at", { ascending: false }),
    db.from("workspace_memberships").select("user_id,role").eq("workspace_id", space.id),
    canManage ? db.from("workspace_invitations").select("id,email,role,expires_at").eq("workspace_id", space.id).eq("status", "pending").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    db.from("activity_events").select("id,actor_id,project_id,action,entity_type,metadata,created_at").eq("workspace_id", space.id).order("created_at", { ascending: false }).limit(100),
    db.from("notifications").select("id,type,title,body,href,read_at,created_at").eq("workspace_id", space.id).eq("recipient_id", userId).order("created_at", { ascending: false }).limit(100),
    db.from("notification_preferences").select("assignments,comments,project_access,github").eq("workspace_id", space.id).eq("user_id", userId).maybeSingle(),
    db.from("github_installations").select("installation_id,account_login,account_type,repository_selection,status").eq("workspace_id", space.id).maybeSingle(),
    view === "overview" ? db.from("tasks").select("id,project_id,title,status,assignee_id").eq("workspace_id", space.id) : Promise.resolve({ data: [], error: null }),
    view === "overview" ? db.from("architecture_decisions").select("id,status").eq("workspace_id", space.id) : Promise.resolve({ data: [], error: null }),
    view === "team" ? db.from("project_memberships").select("project_id,user_id,role").eq("workspace_id", space.id) : Promise.resolve({ data: [], error: null }),
  ]);
  const ideas = (ideaResponse.data ?? []) as Idea[];
  const projects = (projectResponse.data ?? []) as Project[];
  const members = (memberResponse.data ?? []) as Member[];
  const invites = (inviteResponse.data ?? []) as Invitation[];
  const activity = (activityResponse.data ?? []) as ActivityEvent[];
  const notifications = (notificationsResponse.data ?? []) as Notification[];
  const tasks = (taskResponse.data ?? []) as TaskSummary[];
  const decisions = (decisionResponse.data ?? []) as DecisionSummary[];
  const projectMemberships = (projectMembershipResponse.data ?? []) as ProjectMembership[];
  const githubInstallation = githubResponse.data as GitHubInstallation | null;
  const profileIds = Array.from(new Set([
    ...members.map((member) => member.user_id),
    ...activity.flatMap((event) => event.actor_id ? [event.actor_id] : []),
    ...(view === "overview" ? [...ideas.map((idea) => idea.author_id), ...projects.map((project) => project.creator_id)] : []),
  ]));
  const profileResponse = (["team", "activity", "overview"].includes(view) && profileIds.length) ? await db.from("profiles").select("id,display_name").in("id", profileIds) : { data: [], error: null };
  const profiles = new Map((profileResponse.data ?? []).map((profile) => [profile.id, profile.display_name]));
  const preferences = preferencesResponse.data ?? { assignments: true, comments: true, project_access: true, github: true };
  const unreadNotifications = notifications.filter((item) => !item.read_at).length;
  const dataError = ideaResponse.error || ideaCount.error || projectResponse.error || memberResponse.error || inviteResponse.error || activityResponse.error || notificationsResponse.error || preferencesResponse.error || githubResponse.error || taskResponse.error || decisionResponse.error || projectMembershipResponse.error || profileResponse.error;

  return <AppShell spaces={spaces} pendingInvitations={pendingInvitations} activeSpace={space} activeSection={view as "overview" | "ideas" | "projects" | "activity" | "notifications" | "team"} role={role} userName={name} defaultOpen={sidebarOpen} unreadNotifications={unreadNotifications}>
      <main className="workspace-canvas">
        {dataError && <Alert variant="destructive" className="mb-7"><AlertTitle>No se pudieron cargar todos los datos</AlertTitle><AlertDescription>Actualiza la página para volver a intentarlo.</AlertDescription></Alert>}
        {view === "overview" && <WorkspaceOverview workspaceId={space.id} workspaceName={space.name} userId={userId} userName={name} canEdit={canEdit} activeIdeaCount={ideaCount.count ?? 0} ideas={ideas} projects={projects} tasks={tasks} decisions={decisions} activity={activity} profileNames={Object.fromEntries(profiles)} />}
        {view === "ideas" && <>
          <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><Badge className="workspace-kicker mb-5">Bandeja de ideas</Badge><h1 className="workspace-title">Todas las ideas</h1><p className="workspace-subtitle mt-4">Busca, filtra y deja crecer cada posibilidad.</p></div>{canEdit && <CreateIdeaDialog workspaceId={space.id} />}</div>
          <IdeaFiltersForm key={`${query}:${status}:${kind}`} workspaceId={space.id} query={query} status={status} kind={kind} />
          {ideas.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{ideas.map((idea, index) => <Card key={idea.id} className="h-full border-0 transition-transform hover:-translate-y-0.5"><CardHeader><div className="mb-4 flex items-center justify-between gap-3"><div className={`flex size-11 items-center justify-center rounded-2xl ${colors[index % colors.length]}`}><Lightbulb className="size-5" aria-hidden /></div>{canEdit && idea.status !== "converted" && <IdeaCardActions workspaceId={space.id} idea={idea} />}</div><CardTitle className="text-xl"><Link href={`/ideas/${idea.id}?workspace=${space.id}`} className="group inline-flex items-start gap-2 hover:text-primary"><HighlightedText text={idea.title} query={query} /><ArrowRight className="mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden /></Link></CardTitle><CardDescription className="line-clamp-3 min-h-15 leading-relaxed"><HighlightedText text={idea.description || "Aún no hay notas. Abre la idea para desarrollarla."} query={query} /></CardDescription></CardHeader><CardContent><div className="mb-4 flex flex-wrap gap-2"><Badge variant="secondary">{idea.status === "archived" ? "Archivada" : idea.status === "converted" ? "Convertida" : kindNames[idea.kind ?? "undecided"]}</Badge>{idea.tags.slice(0, 2).map((tag) => <Badge variant="outline" key={tag}><HighlightedText text={tag} query={query} /></Badge>)}</div><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(new Date(idea.created_at))}</p></CardContent></Card>)}</div> : <Card className="border-dashed"><CardContent className="flex flex-col items-center py-14 text-center"><div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-pastel-lavender"><Archive aria-hidden /></div><h2 className="text-lg font-semibold">{query || status !== "active" || kind ? "No encontramos ideas con esos filtros" : "Aquí comienza tu próxima idea"}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{query || status !== "active" || kind ? "Prueba otra búsqueda o cambia los filtros." : "Captura una idea en pocas palabras. Podrás ampliarla cuando quieras."}</p>{canEdit && !query && status === "active" && !kind && <div className="mt-6"><CreateIdeaDialog workspaceId={space.id} compact /></div>}</CardContent></Card>}
          {ideas.length === 200 && <p className="mt-5 text-sm text-muted-foreground">Se muestran las primeras 200 ideas. Usa la búsqueda para afinar resultados.</p>}
        </>}
        {view === "projects" && <>
          <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><Badge className="workspace-kicker mb-5 bg-pastel-mint">Del boceto a la acción</Badge><h1 className="workspace-title">Proyectos de {space.name}</h1><p className="workspace-subtitle mt-4">Define el trabajo, sigue los requisitos y avanza tarea a tarea.</p></div>{canEdit && <Button render={<Link href={route(space.id, "ideas")} />}><Plus aria-hidden /> Elegir una idea</Button>}</div>
          {projects.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{projects.map((project, index) => <Link key={project.id} href={`/projects/${project.id}`} className="group block focus-visible:rounded-3xl focus-visible:outline-2 focus-visible:outline-primary"><Card className="h-full border-0 transition-transform group-hover:-translate-y-0.5"><CardHeader><div className={`mb-4 flex size-11 items-center justify-center rounded-2xl ${colors[index % colors.length]}`}><FolderKanban className="size-5" aria-hidden /></div><CardTitle className="line-clamp-2 text-xl">{project.title}</CardTitle><CardDescription className="line-clamp-3 min-h-15 leading-relaxed">{project.objective || "Abre el proyecto para definir su objetivo."}</CardDescription></CardHeader><CardContent><div className="flex flex-wrap gap-2"><Badge variant="secondary">{stageNames[project.stage] ?? project.stage}</Badge><Badge variant="outline">{kindNames[project.kind] ?? project.kind}</Badge></div><p className="mt-4 text-xs text-muted-foreground">Desde {new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(new Date(project.created_at))}</p></CardContent></Card></Link>)}</div> : <Card className="border-dashed"><CardContent className="flex flex-col items-center py-14 text-center"><div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-pastel-mint"><FolderKanban aria-hidden /></div><h2 className="text-lg font-semibold">Todavía no hay proyectos</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Abre una idea activa y conviértela en proyecto para empezar a planificar.</p>{canEdit && <Button className="mt-6" render={<Link href={route(space.id, "ideas")} />}>Explorar ideas</Button>}</CardContent></Card>}
        </>}
        {view === "activity" && <>
          <div className="mb-9"><Badge className="workspace-kicker mb-5">Crónica del espacio</Badge><h1 className="workspace-title">Actividad reciente</h1><p className="workspace-subtitle mt-4">Cambios realizados en ideas y proyectos que puedes ver.</p></div>
          <Card><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-sky"><Activity aria-hidden /></div><CardTitle>Últimos movimientos</CardTitle><CardDescription>Hasta 100 eventos, del más reciente al más antiguo.</CardDescription></CardHeader><CardContent>{activity.length ? <div className="relative ml-2 border-l border-border pl-6">{activity.map((event) => <article key={event.id} className="relative pb-7 last:pb-0"><span className="absolute -left-[1.9rem] top-1 flex size-4 rounded-full border-4 border-card bg-primary" /><p className="text-sm leading-6"><strong>{event.actor_id ? profiles.get(event.actor_id) || "Un miembro" : "El sistema"}</strong> {actionNames[event.action] ?? event.action} {entityNames[event.entity_type] ?? event.entity_type}{event.metadata.label ? <> <span className="font-medium">“{event.metadata.label}”</span></> : null}.</p><time className="mt-1 block text-xs text-muted-foreground" dateTime={event.created_at}>{relativeDate(event.created_at)}</time></article>)}</div> : <p className="py-8 text-center text-sm text-muted-foreground">La actividad aparecerá aquí cuando el equipo haga cambios.</p>}</CardContent></Card>
        </>}
        {view === "notifications" && <>
          <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><Badge className="workspace-kicker mb-5 bg-pastel-peach">Bandeja personal</Badge><h1 className="workspace-title">Notificaciones</h1><p className="workspace-subtitle mt-4">Asignaciones, comentarios, accesos y cambios sincronizados con GitHub.</p></div>{unreadNotifications > 0 && <form action={markAllNotificationsRead}><input type="hidden" name="workspace_id" value={space.id} /><Button type="submit" variant="outline"><Check aria-hidden /> Marcar todas como leídas</Button></form>}</div>
          <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]"><Card><CardHeader><CardTitle>{unreadNotifications ? `${unreadNotifications} sin leer` : "Todo al día"}</CardTitle><CardDescription>Las notificaciones son privadas para tu cuenta.</CardDescription></CardHeader><CardContent className="space-y-3">{notifications.map((notification) => { const Icon = notification.type === "assignment" ? Check : notification.type === "comment" ? MessageCircle : notification.type === "github" ? GitFork : UserRoundPlus; return <article key={notification.id} className={`flex items-start gap-4 rounded-2xl border p-4 ${notification.read_at ? "border-border/60 bg-muted/25" : "border-primary/25 bg-pastel-sky/35"}`}><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card"><Icon className="size-4" aria-hidden /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-sm font-semibold">{notification.title}</h2><p className="mt-1 text-sm text-muted-foreground">{notification.body}</p></div><time className="text-xs text-muted-foreground" dateTime={notification.created_at}>{relativeDate(notification.created_at)}</time></div><div className="mt-3 flex gap-2">{notification.href && <Button size="sm" variant="outline" render={<Link href={notification.href} />}>Abrir</Button>}{!notification.read_at && <form action={markNotificationRead}><input type="hidden" name="notification_id" value={notification.id} /><Button size="sm" variant="ghost" type="submit">Marcar como leída</Button></form>}</div></div></article>; })}{!notifications.length && <div className="flex flex-col items-center py-12 text-center"><Bell className="mb-4 size-8 text-muted-foreground" aria-hidden /><p className="font-semibold">No tienes notificaciones</p><p className="mt-1 text-sm text-muted-foreground">Las nuevas asignaciones y conversaciones aparecerán aquí.</p></div>}</CardContent></Card><Card><CardHeader><CardTitle>Preferencias</CardTitle><CardDescription>Elige qué avisos quieres recibir dentro de Armario Dev.</CardDescription></CardHeader><CardContent><NotificationPreferencesForm workspaceId={space.id} preferences={preferences} /></CardContent></Card></div>
        </>}
        {view === "team" && <>
          <div className="mb-8"><h1 className="workspace-title">Miembros &amp; Roles del Espacio</h1><p className="workspace-subtitle mt-3">Gestiona colaboradores, invitaciones y niveles de autorización de {space.name}.</p></div>
          <WorkspaceMembersAdmin workspaceId={space.id} canManage={canManage} viewerRole={role} members={members.map((member) => ({
            userId: member.user_id,
            name: profiles.get(member.user_id) || "Miembro",
            role: member.role,
            isCurrentUser: member.user_id === userId,
            projects: projectMemberships.filter((access) => access.user_id === member.user_id).map((access) => projects.find((project) => project.id === access.project_id)?.title).filter((title): title is string => Boolean(title)),
            lastActivity: (() => {
              const latest = activity.find((event) => event.actor_id === member.user_id);
              return latest ? relativeDate(latest.created_at) : null;
            })(),
          }))} invitations={invites.map((invite) => ({ id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expires_at }))} audit={activity.map((event) => ({
            actor: event.actor_id ? profiles.get(event.actor_id) || "Un miembro" : "Sistema",
            action: actionNames[event.action] ?? event.action,
            entity: entityNames[event.entity_type] ?? event.entity_type,
            label: event.metadata.label ?? "",
            createdAt: event.created_at,
          }))} />
          <div className="mt-7 grid gap-5 lg:grid-cols-2">
            <Card><CardHeader><CardTitle>Tu perfil</CardTitle><CardDescription>Este nombre aparece en actividad, tareas y comentarios.</CardDescription></CardHeader><CardContent><RenameProfileForm workspaceId={space.id} name={name} /></CardContent></Card>
            {canManage && <Card><CardHeader><div className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-foreground text-background"><GitFork aria-hidden /></div><CardTitle>GitHub</CardTitle><CardDescription>{githubInstallation ? `Conectado con @${githubInstallation.account_login}.` : "Conecta una cuenta u organización para usar repositorios en los proyectos."}</CardDescription></CardHeader><CardContent>{githubInstallation ? <div className="flex flex-col gap-4"><div className="flex flex-wrap gap-2"><Badge variant={githubInstallation.status === "active" ? "default" : "secondary"}>{githubInstallation.status === "active" ? "Conectado" : githubInstallation.status === "suspended" ? "Suspendido" : "Revocado"}</Badge><Badge variant="outline">{githubInstallation.account_type === "Organization" ? "Organización" : "Cuenta personal"}</Badge><Badge variant="outline">{githubInstallation.repository_selection === "all" ? "Todos los repositorios" : "Repositorios elegidos"}</Badge></div><div className="flex flex-wrap gap-2"><Button variant="outline" render={<a href={`https://github.com/settings/installations/${githubInstallation.installation_id}`} target="_blank" rel="noreferrer" />}>Administrar en GitHub</Button><DisconnectGitHubDialog workspaceId={space.id} accountLogin={githubInstallation.account_login} /></div></div> : <Button render={<a href={`/api/github/install?workspace=${space.id}`} />}><GitFork aria-hidden /> Conectar GitHub</Button>}</CardContent></Card>}
            {canManage && <Card><CardHeader><CardTitle>Nombre del espacio</CardTitle></CardHeader><CardContent><RenameWorkspaceForm workspaceId={space.id} name={space.name} /></CardContent></Card>}
          </div>
        </>}
      </main>
  </AppShell>;
}
