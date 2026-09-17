import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ArrowRight, FolderKanban, Lightbulb, Plus, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await auth.protect();
  const user = await currentUser();
  const name = user?.firstName || user?.fullName || "Creador";

  if (!getSupabaseConfig()) {
    return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-8"><Brand /><Card><CardHeader><CardTitle>Tu taller está casi listo</CardTitle><CardDescription>Conecta un proyecto de Supabase para guardar ideas y proyectos.</CardDescription></CardHeader><CardContent><Alert><AlertTitle>Configuración pendiente</AlertTitle><AlertDescription>Agrega la URL y la clave publicable de Supabase en .env.local.</AlertDescription></Alert><Button className="mt-5" variant="outline" render={<Link href="/" />}>Volver al inicio</Button></CardContent></Card></main>;
  }

  const supabase = createClient();
  const { data: workspaceId, error: setupError } = await supabase.rpc("ensure_personal_workspace", { chosen_name: name });
  const [ideasResult, projectsResult] = workspaceId ? await Promise.all([
    supabase.from("ideas").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
  ]) : [{ count: 0, error: null }, { count: 0, error: null }];
  const dataError = setupError || ideasResult.error || projectsResult.error;

  return <SidebarProvider>
    <Sidebar variant="inset" collapsible="offcanvas">
      <SidebarHeader className="p-5"><Brand /></SidebarHeader>
      <SidebarContent><SidebarGroup><SidebarGroupLabel>Tu espacio</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>
        <SidebarMenuItem><SidebarMenuButton isActive render={<Link href="/dashboard" />}><Sparkles aria-hidden="true" /> Vista general</SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton disabled><Lightbulb aria-hidden="true" /> Ideas <Badge variant="secondary" className="ml-auto text-[10px]">Próximamente</Badge></SidebarMenuButton></SidebarMenuItem>
        <SidebarMenuItem><SidebarMenuButton disabled><FolderKanban aria-hidden="true" /> Proyectos</SidebarMenuButton></SidebarMenuItem>
      </SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent>
      <SidebarFooter className="flex flex-row items-center gap-3 p-5"><UserButton /><div className="min-w-0"><p className="truncate text-sm font-semibold">{name}</p><p className="text-xs text-muted-foreground">Mi espacio</p></div></SidebarFooter>
    </Sidebar>
    <SidebarInset className="min-h-screen bg-background">
      <header className="flex h-18 items-center gap-3 border-b border-border/70 px-5 sm:px-8"><SidebarTrigger /><span className="text-sm text-muted-foreground">Mi espacio / Vista general</span></header>
      <main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><Badge className="mb-4 border-0 bg-pastel-mint px-4 py-2 text-foreground">Tu espacio creativo ✦</Badge><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hola, {name} 👋</h1><p className="mt-2 text-muted-foreground">Dale a cada idea su propio espacio.</p></div><Button disabled><Plus data-icon="inline-start" aria-hidden="true" /> Nueva idea</Button></div>
        {dataError && <Alert variant="destructive" className="mb-7"><AlertTitle>No se pudieron cargar los datos</AlertTitle><AlertDescription>Aplica la migración y habilita Clerk como proveedor externo en Supabase.</AlertDescription></Alert>}
        <div className="grid gap-5 sm:grid-cols-2"><Card className="border-0 bg-pastel-sky"><CardHeader><CardDescription className="text-foreground/70">Ideas en tu espacio</CardDescription><CardTitle className="text-4xl font-semibold">{ideasResult.count ?? 0}</CardTitle></CardHeader><CardContent><Lightbulb className="size-6" aria-hidden="true" /></CardContent></Card><Card className="border-0 bg-pastel-mint"><CardHeader><CardDescription className="text-foreground/70">Proyectos en marcha</CardDescription><CardTitle className="text-4xl font-semibold">{projectsResult.count ?? 0}</CardTitle></CardHeader><CardContent><FolderKanban className="size-6" aria-hidden="true" /></CardContent></Card></div>
        <Card className="mt-7 border-0"><CardHeader><div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender"><Sparkles className="size-6 text-primary" aria-hidden="true" /></div><CardTitle className="text-xl font-semibold">{dataError ? "Conexión pendiente" : "Tu taller está preparado"}</CardTitle><CardDescription className="max-w-xl leading-relaxed">{dataError ? "El acceso con Clerk funciona. Falta aplicar la migración y vincular Clerk como proveedor externo de Supabase." : "Tu cuenta de Clerk y tu espacio personal están listos. En la siguiente etapa podrás capturar ideas, convertirlas en proyectos e invitar a otras personas."}</CardDescription></CardHeader><CardContent><p className="inline-flex items-center gap-2 text-sm font-medium text-primary">{dataError ? "Configuración en curso" : "Fundaciones listas"} <ArrowRight className="size-4" aria-hidden="true" /></p></CardContent></Card>
      </main>
    </SidebarInset>
  </SidebarProvider>;
}
