"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  Bell,
  BookOpen,
  ChevronDown,
  Columns3,
  FolderKanban,
  GitFork,
  Lightbulb,
  LayoutDashboard,
  ListTodo,
  KeyRound,
  Plus,
  Search,
  Settings2,
  Users,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { CreateIdeaDialog } from "@/components/idea-dialogs";
import { CreateWorkspaceForm } from "@/components/phase-one-forms";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

type Space = { id: string; name: string; is_personal: boolean };
type Section = "overview" | "ideas" | "projects" | "activity" | "notifications" | "team";

const roleNames: Record<string, string> = {
  owner: "Propietario",
  admin: "Administrador",
  editor: "Editor",
  viewer: "Lector",
};

const sectionNames: Record<Section, string> = {
  overview: "Inicio",
  ideas: "Ideas",
  projects: "Proyectos",
  activity: "Actividad",
  notifications: "Notificaciones",
  team: "Personas",
};

const workspaceHref = (workspaceId: string, section: Section) =>
  `/dashboard?workspace=${workspaceId}&view=${section}`;

export function AppShell({
  children,
  spaces,
  pendingInvitations = [],
  activeSpace,
  activeSection,
  role,
  userName,
  project,
  headerLabel,
  unreadNotifications = 0,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  spaces: Space[];
  pendingInvitations?: { id: string; role: string; workspaceName: string }[];
  activeSpace: Space;
  activeSection: Section;
  role: string;
  userName: string;
  project?: { id: string; title: string; canEdit?: boolean; canManage?: boolean };
  headerLabel?: string;
  unreadNotifications?: number;
  defaultOpen?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectView = pathname.includes("/tasks")
    ? "tasks"
    : pathname.includes("/requirements")
      ? "requirements"
      : pathname.includes("/documentation")
        ? "documentation"
        : searchParams.get("view") ?? "overview";

  const projectItems = project
    ? [
        { value: "overview", label: "Resumen", icon: LayoutDashboard },
        { value: "tasks", label: "Tareas", icon: ListTodo },
        { value: "board", label: "Tablero", icon: Columns3 },
        { value: "requirements", label: "Requisitos", icon: BookOpen },
        { value: "documentation", label: "Documentación", icon: FolderKanban },
        { value: "github", label: "GitHub", icon: GitFork },
        { value: "people", label: "Personas", icon: Users },
        ...(project.canEdit ? [{ value: "settings", label: "Configuración", icon: Settings2 }] : []),
      ]
    : [];

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar variant="sidebar" collapsible="icon" className="top-0 h-svh">
        <SidebarHeader className="h-20 justify-center border-b border-sidebar-border px-5 group-data-[collapsible=icon]:px-2">
          <Brand href={workspaceHref(activeSpace.id, "overview")} />
        </SidebarHeader>
        <SidebarContent className="px-2 py-5">
          {!project ? <>
            <SidebarGroup>
              <SidebarGroupLabel className="text-[0.68rem] font-bold tracking-[0.12em] uppercase">Espacio de trabajo</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {spaces.map((space) => (
                    <SidebarMenuItem key={space.id}>
                      <SidebarMenuButton
                        isActive={space.id === activeSpace.id}
                        tooltip={space.name}
                        render={<Link href={workspaceHref(space.id, "overview")} />}
                      >
                        <span className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${space.is_personal ? "bg-pastel-mint" : "bg-pastel-lavender"}`}>
                          {space.name[0]?.toUpperCase()}
                        </span>
                        <span className="truncate">{space.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
                <details className="mt-4 rounded-2xl border border-sidebar-border bg-card p-3 group-data-[collapsible=icon]:hidden">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-primary">
                    <Plus className="size-4" aria-hidden /> Crear espacio
                  </summary>
                  <div className="mt-4"><CreateWorkspaceForm /></div>
                </details>
              </SidebarGroupContent>
            </SidebarGroup>

            {pendingInvitations.length > 0 && <SidebarGroup>
              <SidebarGroupLabel>Invitaciones</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {pendingInvitations.map((invitation) => (
                    <SidebarMenuItem key={invitation.id}>
                      <SidebarMenuButton
                        tooltip={`Entrar a ${invitation.workspaceName}`}
                        render={<Link href={`/invitaciones/aceptar?id=${invitation.id}`} />}
                      >
                        <KeyRound aria-hidden />
                        <span className="min-w-0">
                          <span className="block truncate">{invitation.workspaceName}</span>
                          <span className="block truncate text-xs text-muted-foreground">Código pendiente · {roleNames[invitation.role]}</span>
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>}

            <SidebarGroup>
              <SidebarGroupLabel className="sr-only">Navegación de {activeSpace.name}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <WorkspaceItem section="overview" label="Inicio" icon={LayoutDashboard} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="ideas" label="Ideas" icon={Lightbulb} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="projects" label="Proyectos" icon={FolderKanban} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="activity" label="Actividad" icon={Activity} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="notifications" label={unreadNotifications ? `Notificaciones (${unreadNotifications})` : "Notificaciones"} icon={Bell} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="team" label="Miembros y roles" icon={Users} active={activeSection} workspaceId={activeSpace.id} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </> : (
            <SidebarGroup>
              <SidebarGroupLabel>Proyecto actual</SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="mb-5 flex items-center gap-3 rounded-2xl bg-pastel-mint/75 p-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm"><FolderKanban className="size-4" aria-hidden /></span>
                  <div className="min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-semibold">{project.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{activeSpace.name}</p>
                  </div>
                </div>
                <SidebarMenu>
                  {projectItems.map((item) => (
                    <SidebarMenuItem key={item.value}>
                      <SidebarMenuButton
                        isActive={projectView === item.value}
                        tooltip={item.label}
                        render={<Link href={`/projects/${project.id}?view=${item.value}`} />}
                      >
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="gap-3 border-t border-sidebar-border p-4 group-data-[collapsible=icon]:px-2">
          {project && <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Volver al menú" render={<Link href={workspaceHref(activeSpace.id, "projects")} />}><ArrowLeft aria-hidden /><span>Volver al menú</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>}
          <SidebarMenu><SidebarMenuItem><SidebarMenuButton tooltip="Configuración" render={<Link href={workspaceHref(activeSpace.id, "team")} />}><Settings2 aria-hidden /><span>Configuración</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <div className="relative flex min-h-svh min-w-0 flex-1 flex-col bg-transparent">
        <header className="sticky top-0 z-30 flex h-20 shrink-0 items-center gap-3 border-b border-border/80 bg-card/94 px-4 backdrop-blur-xl sm:px-6 xl:px-8">
          <SidebarTrigger className="md:hidden" />
          <DropdownMenu>
            <DropdownMenuTrigger className={buttonVariants({ variant: "secondary", className: "max-w-56 justify-between px-4" })}>
              <span className="truncate"><span className="mr-2 inline-block size-2 rounded-full bg-primary" />{activeSpace.name}</span>
              <ChevronDown className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="min-w-64 p-2" align="start" sideOffset={10}>
              <DropdownMenuGroup>
                <DropdownMenuLabel>Espacios disponibles</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {spaces.map((space) => <DropdownMenuItem key={space.id} className="rounded-xl p-2.5" render={<Link href={workspaceHref(space.id, "overview")} />}>
                  <span className={`flex size-7 items-center justify-center rounded-lg text-xs font-bold ${space.is_personal ? "bg-pastel-mint" : "bg-pastel-lavender"}`}>{space.name[0]?.toUpperCase()}</span>
                  <span className="truncate">{space.name}</span>
                </DropdownMenuItem>)}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <form action="/dashboard" className="pill-surface mx-auto hidden h-11 max-w-2xl flex-1 items-center gap-2 px-4 lg:flex">
            <input type="hidden" name="workspace" value={activeSpace.id} />
            <input type="hidden" name="view" value="ideas" />
            <Search className="size-4.5 shrink-0 text-muted-foreground" aria-hidden />
            <input name="q" aria-label="Buscar ideas" placeholder="Buscar ideas, proyectos y tareas…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <kbd className="rounded-lg border border-border bg-card px-2 py-0.5 text-[0.68rem] text-muted-foreground">⌘K</kbd>
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            {["owner", "admin", "editor"].includes(role) && <div className="hidden sm:block"><CreateIdeaDialog workspaceId={activeSpace.id} /></div>}
            <Button variant="ghost" size="icon" render={<Link href={workspaceHref(activeSpace.id, "notifications")} />} aria-label="Notificaciones" className="relative">
              <Bell aria-hidden />
              {unreadNotifications > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-card" />}
            </Button>
            <div className="ml-1 flex items-center gap-2 border-l border-border pl-3">
              <UserButton />
              <div className="hidden min-w-0 2xl:block"><p className="max-w-32 truncate text-xs font-semibold">{userName}</p><p className="text-[0.68rem] text-muted-foreground">{roleNames[role] ?? role}</p></div>
            </div>
          </div>
        </header>
        {(project || activeSection !== "overview") && <div className="border-b border-border/70 bg-card/75 px-5 py-2.5 backdrop-blur sm:px-8 lg:px-10">
          <nav aria-label="Ruta actual" className="flex min-w-0 items-center gap-2 text-xs">
            <Link href={workspaceHref(activeSpace.id, "overview")} className="truncate font-medium text-muted-foreground transition-colors hover:text-foreground">{activeSpace.name}</Link>
            {project && <><span className="text-border">/</span><Link href={`/projects/${project.id}`} className="hidden truncate text-muted-foreground transition-colors hover:text-foreground sm:block">{project.title}</Link></>}
            <span className="text-border">/</span><span className="truncate font-semibold text-primary">{headerLabel ?? (project ? projectItems.find((item) => item.value === projectView)?.label : sectionNames[activeSection])}</span>
          </nav>
        </div>}
        {children}
      </div>
    </SidebarProvider>
  );
}

function WorkspaceItem({ section, label, icon: Icon, active, workspaceId }: {
  section: Section;
  label: string;
  icon: typeof LayoutDashboard;
  active: Section;
  workspaceId: string;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={section === active}
        tooltip={label}
        render={<Link href={workspaceHref(workspaceId, section)} />}
      >
        <Icon aria-hidden />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
