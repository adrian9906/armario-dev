"use client";

import { useMemo, useState } from "react";
import { Activity, BadgeCheck, BriefcaseBusiness, Download, Filter, KeyRound, MailPlus, Search, ShieldCheck, UserRoundCheck, Users, X } from "lucide-react";
import { toast } from "sonner";
import { revokeInvitation } from "@/app/dashboard/actions";
import { InviteMemberForm } from "@/components/phase-one-forms";
import { MemberRoleForm } from "@/components/member-role-form";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type MemberRow = {
  userId: string;
  name: string;
  role: string;
  projects: string[];
  lastActivity: string | null;
  isCurrentUser: boolean;
};
type InvitationRow = { id: string; email: string; role: string; expiresAt: string };
type AuditRow = { actor: string; action: string; entity: string; label: string; createdAt: string };

const roleNames: Record<string, string> = { owner: "Propietario", admin: "Administrador", editor: "Editor", viewer: "Lector" };
const rolePlural: Record<string, string> = { owner: "Propietarios", admin: "Administradores", editor: "Editores", viewer: "Lectores" };
const roleDescriptions = [
  { name: "Propietario", scope: "Control completo del espacio", access: "Gestiona roles, invitaciones, proyectos y configuración" },
  { name: "Administrador", scope: "Administración del equipo", access: "Invita personas y gestiona los roles que tiene permitidos" },
  { name: "Editor", scope: "Creación y edición", access: "Trabaja con ideas y proyectos según el acceso asignado" },
  { name: "Lector", scope: "Solo lectura", access: "Consulta el contenido al que tiene acceso" },
];

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function safeCsv(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportAudit(rows: AuditRow[]) {
  if (!rows.length) {
    toast.info("Todavía no hay actividad para exportar.");
    return;
  }
  const header = ["Fecha", "Persona", "Acción", "Elemento", "Detalle"];
  const body = rows.map((row) => [new Date(row.createdAt).toISOString(), row.actor, row.action, row.entity, row.label]);
  const csv = [header, ...body].map((line) => line.map((value) => safeCsv(String(value))).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `auditoria-espacio-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  toast.success("Auditoría descargada.");
}

export function WorkspaceMembersAdmin({ workspaceId, members, invitations, audit, canManage, viewerRole }: {
  workspaceId: string;
  members: MemberRow[];
  invitations: InvitationRow[];
  audit: AuditRow[];
  canManage: boolean;
  viewerRole: string;
}) {
  const [tab, setTab] = useState<"members" | "invitations" | "permissions">("members");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const counts = useMemo(() => members.reduce<Record<string, number>>((all, member) => {
    all[member.role] = (all[member.role] ?? 0) + 1;
    return all;
  }, {}), [members]);
  const visibleMembers = useMemo(() => members.filter((member) => {
    const matchesSearch = `${member.name} ${member.projects.join(" ")}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return matchesSearch && (roleFilter === "all" || member.role === roleFilter);
  }), [members, roleFilter, search]);

  const tabs = [
    { id: "members" as const, label: "Miembros activos", count: members.length, icon: UserRoundCheck },
    { id: "invitations" as const, label: "Invitaciones pendientes", count: canManage ? invitations.length : undefined, icon: MailPlus },
    { id: "permissions" as const, label: "Matriz de permisos", icon: KeyRound },
  ];

  return <div className="space-y-7">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="rounded-full bg-pastel-lavender px-3 text-primary">Gestión de acceso · roles del espacio</Badge>
        <Badge variant="secondary" className="rounded-full"><span className="mr-1.5 size-2 rounded-full bg-emerald-600" />Permisos protegidos en servidor</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {canManage && <Button variant="outline" className="rounded-full" onClick={() => exportAudit(audit)}><Download aria-hidden />Exportar auditoría</Button>}
        {canManage && <Dialog><DialogTrigger render={<Button className="rounded-full shadow-md shadow-primary/20" />}><Users aria-hidden />Invitar por correo</DialogTrigger><DialogContent>
          <DialogHeader><DialogTitle>Invitar al espacio</DialogTitle><DialogDescription>La invitación se enviará por correo y tendrá una fecha de expiración.</DialogDescription></DialogHeader>
          <InviteMemberForm workspaceId={workspaceId} />
        </DialogContent></Dialog>}
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="border-0 bg-pastel-mint"><CardContent className="flex min-h-48 flex-col justify-between p-6"><div className="flex items-center justify-between text-sm font-medium text-foreground/75"><span>Miembros activos</span><span className="flex size-10 items-center justify-center rounded-full bg-white/80 text-emerald-800"><Users className="size-5" /></span></div><div><p className="font-heading text-5xl font-semibold tracking-tight">{members.length}</p><p className="mt-2 text-sm text-foreground/65">Personas con acceso al espacio</p></div><Badge variant="secondary" className="w-fit rounded-full bg-white/65">Roles administrados en el espacio</Badge></CardContent></Card>
      <Card className="border-0 bg-pastel-sky"><CardContent className="flex min-h-48 flex-col justify-between p-6"><div className="flex items-center justify-between text-sm font-medium text-foreground/75"><span>Invitaciones pendientes</span><span className="flex size-10 items-center justify-center rounded-full bg-white/80 text-primary"><MailPlus className="size-5" /></span></div><div><p className="font-heading text-5xl font-semibold tracking-tight">{canManage ? invitations.length : "—"}</p><p className="mt-2 text-sm text-foreground/65">{canManage ? "Esperando a que se unan" : "Visible para administradores"}</p></div><Badge variant="secondary" className="w-fit rounded-full bg-white/65">Ventana de invitación: 7 días</Badge></CardContent></Card>
      <Card className="border-0 bg-pastel-lavender"><CardContent className="flex min-h-48 flex-col justify-between p-6"><div className="flex items-center justify-between text-sm font-medium text-foreground/75"><span>Distribución de roles</span><span className="flex size-10 items-center justify-center rounded-full bg-white/80 text-violet-800"><BadgeCheck className="size-5" /></span></div><div className="flex flex-wrap gap-2">{Object.entries(roleNames).map(([key, label]) => <Badge key={key} variant="secondary" className="rounded-full bg-white/75">{counts[key] ?? 0} {(counts[key] ?? 0) === 1 ? label : rolePlural[key]}</Badge>)}</div><p className="text-sm text-foreground/65">Roles aplicados a nivel de espacio</p></CardContent></Card>
      <Card className="border-0 bg-pastel-peach"><CardContent className="flex min-h-48 flex-col justify-between p-6"><div className="flex items-center justify-between text-sm font-medium text-foreground/75"><span>Seguridad del espacio</span><span className="flex size-10 items-center justify-center rounded-full bg-white/80 text-orange-700"><ShieldCheck className="size-5" /></span></div><div><p className="font-heading text-2xl font-semibold">Acceso aislado</p><p className="mt-2 text-sm leading-relaxed text-foreground/70">Los cambios de rol se validan en el servidor y las consultas se limitan al espacio.</p></div><div className="flex items-center gap-2 text-sm font-medium text-emerald-800"><ShieldCheck className="size-4" />Políticas de acceso activas</div></CardContent></Card>
    </div>

    <section className="overflow-hidden rounded-[1.75rem] border border-border/60 bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/60 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Administración de miembros" className="flex min-w-0 flex-wrap gap-1">
          {tabs.map(({ id, label, count, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm transition-colors ${tab === id ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon className="size-4" aria-hidden />{label}{count !== undefined && <span className={`rounded-full px-2 py-0.5 text-xs ${tab === id ? "bg-white/20" : "bg-muted"}`}>{count}</span>}</button>)}
        </div>
        {tab === "members" && <div className="flex flex-wrap items-center gap-2 px-1">
          <label className="relative min-w-52 flex-1 sm:w-64 sm:flex-none"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar por nombre o proyecto…" className="h-10 rounded-full border-0 bg-muted/70 pl-9" /><span className="sr-only">Buscar miembros</span></label>
          <Select value={roleFilter} onValueChange={(value) => value && setRoleFilter(value)} items={[{ value: "all", label: "Todos los roles" }, ...Object.entries(roleNames).map(([value, label]) => ({ value, label }))]}><SelectTrigger aria-label="Filtrar por rol" className="h-10 w-44 rounded-full border-0 bg-muted/70"><Filter className="size-4" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los roles</SelectItem>{Object.entries(roleNames).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        </div>}
      </div>

      {tab === "members" && <>
        <div className="hidden grid-cols-[minmax(220px,1.5fr)_minmax(155px,0.9fr)_minmax(180px,1fr)_minmax(125px,0.75fr)_44px] gap-4 bg-muted/50 px-6 py-4 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid"><span>Colaborador</span><span>Rol en espacio</span><span>Proyectos asignados</span><span>Última actividad</span><span className="sr-only">Acciones</span></div>
        <div className="divide-y divide-border/60">
          {visibleMembers.map((member) => <article key={member.userId} className="grid gap-4 px-5 py-5 transition-colors hover:bg-muted/20 lg:grid-cols-[minmax(220px,1.5fr)_minmax(155px,0.9fr)_minmax(180px,1fr)_minmax(125px,0.75fr)_44px] lg:items-center lg:px-6">
            <div className="flex min-w-0 items-center gap-3"><Avatar size="lg"><AvatarFallback className="bg-pastel-lavender font-medium text-foreground">{initials(member.name)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-medium">{member.name}{member.isCurrentUser && <span className="ml-1 text-muted-foreground">(tú)</span>}</p><p className="text-sm text-muted-foreground">Miembro del espacio</p></div></div>
            <div><span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground lg:hidden">Rol en espacio</span>{canManage && member.role !== "owner" && !member.isCurrentUser && (viewerRole === "owner" || member.role !== "admin") ? <MemberRoleForm key={`${member.userId}:${member.role}`} workspaceId={workspaceId} userId={member.userId} role={member.role} /> : <Badge variant="secondary" className="rounded-full bg-primary/10 px-3 font-medium text-primary"><KeyRound className="mr-1 size-3.5" />{roleNames[member.role] ?? member.role}</Badge>}</div>
            <div><span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground lg:hidden">Proyectos asignados</span>{member.projects.length ? <div className="flex flex-wrap gap-1.5">{member.projects.slice(0, 3).map((project) => <Badge variant="secondary" key={project} className="max-w-full truncate rounded-full bg-muted">{project}</Badge>)}{member.projects.length > 3 && <Badge variant="secondary" className="rounded-full">+{member.projects.length - 3}</Badge>}</div> : <span className="text-sm text-muted-foreground">Sin asignaciones específicas</span>}</div>
            <div><span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground lg:hidden">Última actividad</span>{member.lastActivity ? <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><Activity className="size-3.5" aria-hidden />{member.lastActivity}</span> : <span className="text-sm text-muted-foreground">Sin actividad reciente</span>}</div>
            <div className="flex justify-end"><Badge variant="outline" className="rounded-full border-border/70 text-muted-foreground"><BriefcaseBusiness className="mr-1 size-3.5" />Espacio</Badge></div>
          </article>)}
          {!visibleMembers.length && <div className="flex flex-col items-center px-6 py-14 text-center"><Search className="mb-3 size-8 text-muted-foreground/60" /><p className="font-medium">No encontramos miembros</p><p className="mt-1 text-sm text-muted-foreground">Prueba otra búsqueda o cambia el filtro por rol.</p><Button variant="ghost" size="sm" className="mt-2" onClick={() => { setSearch(""); setRoleFilter("all"); }}><X className="size-4" />Limpiar filtros</Button></div>}
        </div>
      </>}

      {tab === "invitations" && <div className="p-5 sm:p-7">
        {!canManage ? <div className="rounded-2xl bg-muted/50 p-6 text-sm text-muted-foreground">Solo propietarios y administradores pueden consultar las invitaciones pendientes.</div> : invitations.length ? <div className="divide-y divide-border/60">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"><div className="flex min-w-0 items-center gap-3"><Avatar><AvatarFallback className="bg-pastel-sky text-primary"><MailPlus className="size-4" /></AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-medium">{invitation.email}</p><p className="text-sm text-muted-foreground">{roleNames[invitation.role] ?? invitation.role} · vence {new Intl.DateTimeFormat("es", { day: "numeric", month: "short", year: "numeric" }).format(new Date(invitation.expiresAt))}</p></div></div><form action={revokeInvitation}><input type="hidden" name="workspace_id" value={workspaceId} /><input type="hidden" name="invitation_id" value={invitation.id} /><Button type="submit" size="sm" variant="outline" className="rounded-full">Revocar invitación</Button></form></div>)}</div> : <div className="flex flex-col items-center py-12 text-center"><MailPlus className="mb-3 size-8 text-muted-foreground/60" /><p className="font-medium">No hay invitaciones pendientes</p><p className="mt-1 text-sm text-muted-foreground">Invita a tus colaboradores para que se unan al espacio.</p></div>}
      </div>}

      {tab === "permissions" && <div className="space-y-5 p-5 sm:p-7"><div><h2 className="text-lg font-semibold">Roles y alcance de acceso</h2><p className="mt-1 text-sm text-muted-foreground">Los permisos se verifican del lado del servidor en cada operación.</p></div><div className="grid gap-3 md:grid-cols-2">{roleDescriptions.map((role) => <div key={role.name} className="rounded-2xl bg-muted/45 p-5"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{role.name}</p><p className="mt-1 text-sm text-muted-foreground">{role.scope}</p></div><Badge variant="secondary" className="rounded-full">{counts[Object.entries(roleNames).find(([, name]) => name === role.name)?.[0] ?? ""] ?? 0} personas</Badge></div><p className="mt-4 border-t border-border/60 pt-3 text-sm leading-relaxed text-muted-foreground">{role.access}</p></div>)}</div><div className="flex items-start gap-3 rounded-2xl bg-pastel-sky/55 p-4 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><p>La base de datos aplica políticas de acceso por espacio. El propietario no se puede retirar ni cambiar de rol desde esta tabla.</p></div></div>}
    </section>

    {canManage && audit.length > 0 && <p className="px-1 text-xs text-muted-foreground">La auditoría incluye hasta los últimos {audit.length} eventos disponibles en este espacio.</p>}
  </div>;
}
