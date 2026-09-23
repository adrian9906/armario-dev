"use client";

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Activity,
  Bell,
  BookOpen,
  Columns3,
  FolderKanban,
  Lightbulb,
  ListTodo,
  KeyRound,
  Plus,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { CreateWorkspaceForm } from "@/components/phase-one-forms";
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
  overview: "Vista general",
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
        { value: "overview", label: "Resumen", icon: Sparkles },
        { value: "tasks", label: "Tareas", icon: ListTodo },
        { value: "board", label: "Tablero", icon: Columns3 },
        { value: "requirements", label: "Requisitos", icon: BookOpen },
        { value: "documentation", label: "Documentación", icon: FolderKanban },
        { value: "people", label: "Personas", icon: Users },
        ...(project.canEdit ? [{ value: "settings", label: "Configuración", icon: Settings2 }] : []),
      ]
    : [];

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader className="h-20 justify-center border-b border-sidebar-border px-5 group-data-[collapsible=icon]:px-2">
          <Brand href={workspaceHref(activeSpace.id, "overview")} />
        </SidebarHeader>
        <SidebarContent className="py-3">
          {!project ? <>
            <SidebarGroup>
              <SidebarGroupLabel>Espacios</SidebarGroupLabel>
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
                <details className="mt-4 rounded-xl border border-sidebar-border bg-card p-3 group-data-[collapsible=icon]:hidden">
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
              <SidebarGroupLabel>En {activeSpace.name}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <WorkspaceItem section="overview" label="Vista general" icon={Sparkles} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="ideas" label="Ideas" icon={Lightbulb} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="projects" label="Proyectos" icon={FolderKanban} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="activity" label="Actividad" icon={Activity} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="notifications" label={unreadNotifications ? `Notificaciones (${unreadNotifications})` : "Notificaciones"} icon={Bell} active={activeSection} workspaceId={activeSpace.id} />
                  <WorkspaceItem section="team" label="Personas" icon={Users} active={activeSection} workspaceId={activeSpace.id} />
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </> : (
            <SidebarGroup>
              <SidebarGroupLabel>Proyecto actual</SidebarGroupLabel>
              <SidebarGroupContent>
                <div className="mb-4 flex items-center gap-3 rounded-xl bg-pastel-mint/70 p-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-sm"><FolderKanban className="size-4" aria-hidden /></span>
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
          <div className="flex items-center gap-3 px-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
            <UserButton />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold">{userName}</p>
              <p className="text-xs text-muted-foreground">{roleNames[role] ?? role}</p>
            </div>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <div className="relative flex min-h-svh min-w-0 flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2">
        <header className="sticky top-0 z-30 flex h-20 shrink-0 items-center gap-3 border-b border-border/70 bg-card/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <SidebarTrigger />
          <nav aria-label="Ruta actual" className="flex min-w-0 items-center gap-2 text-sm">
            <Link href={workspaceHref(activeSpace.id, "overview")} className="truncate text-muted-foreground transition-colors hover:text-foreground">
              {activeSpace.name}
            </Link>
            {project && <><span className="text-border">/</span><Link href={`/projects/${project.id}`} className="hidden truncate text-muted-foreground transition-colors hover:text-foreground sm:block">{project.title}</Link></>}
            <span className="text-border">/</span>
            <span className="truncate font-semibold text-foreground">{headerLabel ?? (project ? projectItems.find((item) => item.value === projectView)?.label : sectionNames[activeSection])}</span>
          </nav>
        </header>
        {children}
      </div>
    </SidebarProvider>
  );
}

function WorkspaceItem({ section, label, icon: Icon, active, workspaceId }: {
  section: Section;
  label: string;
  icon: typeof Sparkles;
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
