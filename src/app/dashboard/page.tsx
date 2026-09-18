import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ArrowRight, Archive, FolderKanban, Lightbulb, Plus, Sparkles, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { IdeaFiltersForm } from "@/components/idea-filters-form";
import { MemberRoleForm } from "@/components/member-role-form";
import { CreateWorkspaceForm, InviteMemberForm, RenameWorkspaceForm } from "@/components/phase-one-forms";
import { revokeInvitation } from "./actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
type Params = Promise<{ workspace?: string; view?: string; q?: string; status?: string; kind?: string }>;
type Space = { id: string; name: string; is_personal: boolean };
type Idea = { id: string; title: string; description: string; kind: string | null; status: string; tags: string[]; created_at: string };
type Member = { user_id: string; role: string };
type Invitation = { id: string; email: string; role: string; expires_at: string };
const kindNames: Record<string, string> = { web: "Web", mobile: "Móvil", frontend: "Frontend", backend: "Backend", mixed: "Frontend y backend", other: "Otro", undecided: "Por definir" };
const roleNames: Record<string, string> = { owner: "Propietario", admin: "Administrador", editor: "Editor", viewer: "Lector" };
const colors = ["bg-pastel-lavender", "bg-pastel-sky", "bg-pastel-peach", "bg-pastel-mint"];
const route = (id: string, view: string) => `/dashboard?workspace=${id}&view=${view}`;

export default async function DashboardPage({ searchParams }: { searchParams: Params }) {
  const { userId } = await auth.protect();
  const user = await currentUser();
  const name = user?.firstName || user?.fullName || "Creador";
  const params = await searchParams;
  if (!getSupabaseConfig()) return <main className="mx-auto max-w-3xl p-8"><Brand /><Alert className="mt-8"><AlertTitle>Tu taller está casi listo</AlertTitle><AlertDescription>Revisa la URL y la clave publicable de Supabase en .env o .env.local.</AlertDescription></Alert></main>;

  const db = createClient();
  const setup = await db.rpc("ensure_personal_workspace", { chosen_name: name });
  if (setup.error) return <main className="mx-auto max-w-3xl p-8"><Brand /><Alert variant="destructive" className="mt-8"><AlertTitle>No se pudieron cargar los datos</AlertTitle><AlertDescription>Revisa la conexión entre Clerk y Supabase y actualiza la página.</AlertDescription></Alert></main>;
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
  const view = ["overview", "ideas", "team"].includes(params.view ?? "") ? params.view! : "overview";
  const status = ["active", "archived", "all"].includes(params.status ?? "") ? params.status! : "active";
  const kind = Object.keys(kindNames).includes(params.kind ?? "") ? params.kind! : "";
  const query = (params.q ?? "").trim().slice(0, 120);
  const [ideaResponse, ideaCount, projectCount, memberResponse, inviteResponse] = await Promise.all([
    db.rpc("search_workspace_ideas", { target_workspace_id: space.id, search_term: query, filter_status: status, filter_kind: kind }),
    db.from("ideas").select("id", { count: "exact", head: true }).eq("workspace_id", space.id).eq("status", "active"),
    db.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", space.id),
    db.from("workspace_memberships").select("user_id,role").eq("workspace_id", space.id),
    canManage ? db.from("workspace_invitations").select("id,email,role,expires_at").eq("workspace_id", space.id).eq("status", "pending").order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  const ideas = (ideaResponse.data ?? []) as Idea[];
  const members = (memberResponse.data ?? []) as Member[];
  const invites = (inviteResponse.data ?? []) as Invitation[];
  const profileResponse = view === "team" && members.length ? await db.from("profiles").select("id,display_name").in("id", members.map((member) => member.user_id)) : { data: [], error: null };
  const profiles = new Map((profileResponse.data ?? []).map((profile) => [profile.id, profile.display_name]));
  const dataError = ideaResponse.error || ideaCount.error || projectCount.error || memberResponse.error || inviteResponse.error || profileResponse.error;

  return <SidebarProvider>
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader className="p-5"><Brand /></SidebarHeader>
      <SidebarContent>
        <SidebarGroup><SidebarGroupLabel>Espacios</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
          {spaces.map((item) => <SidebarMenuItem key={item.id}><SidebarMenuButton isActive={item.id === space.id} render={<Link href={route(item.id, "overview")} />}><span className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${item.is_personal ? "bg-pastel-mint" : "bg-pastel-lavender"}`}>{item.name[0]?.toUpperCase()}</span><span className="truncate">{item.name}</span></SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu><details className="mt-4 rounded-xl border border-border/70 bg-white p-3"><summary className="cursor-pointer text-sm font-medium text-primary">＋ Crear espacio</summary><div className="mt-4"><CreateWorkspaceForm /></div></details></SidebarGroupContent></SidebarGroup>
        <SidebarGroup><SidebarGroupLabel>En {space.name}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
          <SidebarMenuItem><SidebarMenuButton isActive={view === "overview"} render={<Link href={route(space.id, "overview")} />}><Sparkles aria-hidden /> Vista general</SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton isActive={view === "ideas"} render={<Link href={route(space.id, "ideas")} />}><Lightbulb aria-hidden /> Ideas</SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton isActive={view === "team"} render={<Link href={route(space.id, "team")} />}><Users aria-hidden /> Personas</SidebarMenuButton></SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton disabled><FolderKanban aria-hidden /> Proyectos <Badge variant="secondary" className="ml-auto text-[10px]">Próxima fase</Badge></SidebarMenuButton></SidebarMenuItem>
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="flex flex-row items-center gap-3 p-5"><UserButton /><div className="min-w-0"><p className="truncate text-sm font-semibold">{name}</p><p className="text-xs text-muted-foreground">{roleNames[role]}</p></div></SidebarFooter>
    </Sidebar>
    <SidebarInset className="min-h-screen bg-background">
      <header className="flex h-18 items-center gap-3 border-b border-border/70 px-5 sm:px-8"><SidebarTrigger /><span className="truncate text-sm text-muted-foreground">{space.name} / {view === "team" ? "Personas" : view === "ideas" ? "Ideas" : "Vista general"}</span></header>
      <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8">
        {dataError && <Alert variant="destructive" className="mb-7"><AlertTitle>No se pudieron cargar todos los datos</AlertTitle><AlertDescription>Actualiza la página para volver a intentarlo.</AlertDescription></Alert>}
        {view === "overview" && <>
          <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><Badge className="mb-4 border-0 bg-pastel-mint px-4 py-2 text-foreground">Tu espacio creativo ✦</Badge><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hola, {name} 👋</h1><p className="mt-2 text-muted-foreground">Ideas y personas reunidas en {space.name}.</p></div>{canEdit && <Button render={<Link href={`/ideas/new?workspace=${space.id}`} />}><Plus aria-hidden /> Nueva idea</Button>}</div>
          <div className="grid gap-5 sm:grid-cols-3"><Card className="border-0 bg-pastel-sky"><CardHeader><CardDescription className="text-foreground/70">Ideas activas</CardDescription><CardTitle className="text-4xl">{ideaCount.count ?? 0}</CardTitle></CardHeader><CardContent><Lightbulb aria-hidden /></CardContent></Card><Card className="border-0 bg-pastel-mint"><CardHeader><CardDescription className="text-foreground/70">Personas</CardDescription><CardTitle className="text-4xl">{members.length}</CardTitle></CardHeader><CardContent><Users aria-hidden /></CardContent></Card><Card className="border-0 bg-pastel-peach"><CardHeader><CardDescription className="text-foreground/70">Proyectos</CardDescription><CardTitle className="text-4xl">{projectCount.count ?? 0}</CardTitle></CardHeader><CardContent><FolderKanban aria-hidden /></CardContent></Card></div>
          <div className="mt-8 grid gap-5 lg:grid-cols-2"><Card><CardHeader><div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender"><Lightbulb aria-hidden /></div><CardTitle>De una chispa a un proyecto</CardTitle><CardDescription>Guarda lo que imaginas y dale forma con notas y etiquetas.</CardDescription></CardHeader><CardContent><Button variant="outline" render={<Link href={route(space.id, "ideas")} />}>Explorar ideas <ArrowRight aria-hidden /></Button></CardContent></Card><Card><CardHeader><div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-pastel-mint"><Users aria-hidden /></div><CardTitle>Construir en compañía</CardTitle><CardDescription>Invita a personas con el rol adecuado para revisar o desarrollar ideas.</CardDescription></CardHeader><CardContent><Button variant="outline" render={<Link href={route(space.id, "team")} />}>Ver equipo <ArrowRight aria-hidden /></Button></CardContent></Card></div>
        </>}
        {view === "ideas" && <>
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><Badge className="mb-4 border-0 bg-pastel-lavender px-4 py-2 text-foreground">Bandeja de ideas</Badge><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Todas las ideas</h1><p className="mt-2 text-muted-foreground">Busca, filtra y deja crecer cada posibilidad.</p></div>{canEdit && <Button render={<Link href={`/ideas/new?workspace=${space.id}`} />}><Plus aria-hidden /> Nueva idea</Button>}</div>
          <IdeaFiltersForm workspaceId={space.id} query={query} status={status} kind={kind} />
          {ideas.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{ideas.map((idea, index) => <Link key={idea.id} href={`/ideas/${idea.id}?workspace=${space.id}`} className="group block focus-visible:rounded-3xl focus-visible:outline-2 focus-visible:outline-primary"><Card className="h-full border-0 transition-transform group-hover:-translate-y-1"><CardHeader><div className={`mb-4 flex size-11 items-center justify-center rounded-2xl ${colors[index % colors.length]}`}><Lightbulb className="size-5" aria-hidden /></div><div className="flex items-start justify-between gap-3"><CardTitle className="line-clamp-2 text-lg">{idea.title}</CardTitle><ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden /></div><CardDescription className="line-clamp-3 min-h-15 leading-relaxed">{idea.description || "Aún no hay notas. Abre la idea para desarrollarla."}</CardDescription></CardHeader><CardContent><div className="mb-4 flex flex-wrap gap-2"><Badge variant="secondary">{idea.status === "archived" ? "Archivada" : kindNames[idea.kind ?? "undecided"]}</Badge>{idea.tags.slice(0, 2).map((tag) => <Badge variant="outline" key={tag}>{tag}</Badge>)}</div><p className="text-xs text-muted-foreground">{new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(new Date(idea.created_at))}</p></CardContent></Card></Link>)}</div> : <Card className="border-dashed"><CardContent className="flex flex-col items-center py-14 text-center"><div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-pastel-lavender"><Archive aria-hidden /></div><h2 className="text-lg font-semibold">{query || status !== "active" || kind ? "No encontramos ideas con esos filtros" : "Aquí comienza tu próxima idea"}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{query || status !== "active" || kind ? "Prueba otra búsqueda o cambia los filtros." : "Captura una idea en pocas palabras. Podrás ampliarla cuando quieras."}</p>{canEdit && !query && status === "active" && !kind && <Button className="mt-6" render={<Link href={`/ideas/new?workspace=${space.id}`} />}>Crear la primera idea</Button>}</CardContent></Card>}
          {ideas.length === 200 && <p className="mt-5 text-sm text-muted-foreground">Se muestran las primeras 200 ideas. Usa la búsqueda para afinar resultados.</p>}
        </>}
        {view === "team" && <>
          <div className="mb-8"><Badge className="mb-4 border-0 bg-pastel-sky px-4 py-2 text-foreground">Personas y permisos</Badge><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Equipo de {space.name}</h1><p className="mt-2 text-muted-foreground">Cada persona accede según su rol dentro de este espacio.</p></div>
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]"><div className="space-y-6"><Card><CardHeader><CardTitle>Miembros · {members.length}</CardTitle><CardDescription>Propietario, administradores, editores y lectores.</CardDescription></CardHeader><CardContent className="space-y-3">{members.map((member) => <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 p-4"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-full bg-pastel-lavender text-sm font-semibold">{(profiles.get(member.user_id) || "?")[0]?.toUpperCase()}</span><div><p className="text-sm font-semibold">{profiles.get(member.user_id) || "Miembro"}{member.user_id === userId ? " (tú)" : ""}</p><p className="text-xs text-muted-foreground">{roleNames[member.role]}</p></div></div>{canManage && member.role !== "owner" && member.user_id !== userId && (role === "owner" || member.role !== "admin") && <MemberRoleForm workspaceId={space.id} userId={member.user_id} role={member.role} />}</div>)}</CardContent></Card>
          {canManage && <Card><CardHeader><CardTitle>Invitaciones pendientes</CardTitle><CardDescription>Vencen a los siete días y solo dan acceso después de aceptarse.</CardDescription></CardHeader><CardContent>{invites.length ? <div className="space-y-3">{invites.map((invite) => <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 p-4"><div><p className="text-sm font-medium">{invite.email}</p><p className="text-xs text-muted-foreground">{roleNames[invite.role]} · vence {new Intl.DateTimeFormat("es", { day: "numeric", month: "short" }).format(new Date(invite.expires_at))}</p></div><form action={revokeInvitation}><input type="hidden" name="workspace_id" value={space.id} /><input type="hidden" name="invitation_id" value={invite.id} /><Button type="submit" variant="outline" size="sm">Revocar</Button></form></div>)}</div> : <p className="text-sm text-muted-foreground">No hay invitaciones pendientes.</p>}</CardContent></Card>}</div>
          <div className="space-y-6">{canManage && <Card className="border-0 bg-pastel-mint/60"><CardHeader><div className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-white"><Users aria-hidden /></div><CardTitle>Invitar a alguien</CardTitle><CardDescription>Le enviaremos un correo. Su acceso empieza cuando acepte con ese correo.</CardDescription></CardHeader><CardContent><InviteMemberForm workspaceId={space.id} /></CardContent></Card>}{canManage && <Card><CardHeader><CardTitle>Nombre del espacio</CardTitle></CardHeader><CardContent><RenameWorkspaceForm workspaceId={space.id} name={space.name} /></CardContent></Card>}</div></div>
        </>}
      </main>
    </SidebarInset>
  </SidebarProvider>;
}
