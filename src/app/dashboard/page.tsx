import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FolderKanban, Lightbulb, Plus, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  if (!getSupabaseConfig()) {
    return <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-8"><Brand /><Card><CardHeader><CardTitle>Tu taller está casi listo</CardTitle><CardDescription>Conecta un proyecto de Supabase para habilitar cuentas y espacios.</CardDescription></CardHeader><CardContent><Alert><AlertTitle>Configuración pendiente</AlertTitle><AlertDescription>Copia .env.example a .env.local, añade la URL y la clave publicable, y aplica la migración de supabase/migrations.</AlertDescription></Alert><Button className="mt-5" variant="outline" render={<Link href="/" />}>Volver al inicio</Button></CardContent></Card></main>;
  }

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError || !claims?.claims?.sub) redirect("/login");
  const userId = claims.claims.sub;
  const [profileResult, workspaceResult] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    supabase.from("workspaces").select("id,name").eq("is_personal", true).eq("owner_id", userId).maybeSingle(),
  ]);
  const profile = profileResult.data;
  const workspace = workspaceResult.data;
  const [ideasResult, projectsResult] = workspace ? await Promise.all([
    supabase.from("ideas").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("workspace_id", workspace.id),
  ]) : [{ count: 0 }, { count: 0 }];
  const name = profile?.display_name ?? "Creador";
  const dataError = profileResult.error || workspaceResult.error || ("error" in ideasResult && ideasResult.error) || ("error" in projectsResult && projectsResult.error);

  return <SidebarProvider>
    <Sidebar variant="inset" collapsible="offcanvas"><SidebarHeader className="p-5"><Brand /></SidebarHeader><SidebarContent><SidebarGroup><SidebarGroupLabel>Tu espacio</SidebarGroupLabel><SidebarGroupContent><SidebarMenu><SidebarMenuItem><SidebarMenuButton isActive render={<Link href="/dashboard" />}><Sparkles aria-hidden="true" /> Vista general</SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton disabled><Lightbulb aria-hidden="true" /> Ideas <Badge variant="secondary" className="ml-auto text-[10px]">Próximamente</Badge></SidebarMenuButton></SidebarMenuItem><SidebarMenuItem><SidebarMenuButton disabled><FolderKanban aria-hidden="true" /> Proyectos</SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroupContent></SidebarGroup></SidebarContent><SidebarFooter className="p-5"><div className="flex items-center gap-3"><Avatar><AvatarFallback className="bg-pastel-lavender">{name.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate text-sm font-semibold">{name}</p><p className="text-xs text-muted-foreground">{workspace?.name ?? "Mi espacio"}</p></div></div><SignOutButton /></SidebarFooter></Sidebar>
    <SidebarInset className="min-h-screen bg-background"><header className="flex h-18 items-center gap-3 border-b border-border/70 px-5 sm:px-8"><SidebarTrigger /><span className="text-sm text-muted-foreground">Mi espacio / Vista general</span></header><main className="mx-auto w-full max-w-6xl px-5 py-9 sm:px-8"><div className="mb-9 flex flex-wrap items-end justify-between gap-4"><div><Badge className="mb-4 border-0 bg-pastel-mint px-4 py-2 text-foreground">Tu espacio creativo ✦</Badge><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Hola, {name.split(" ")[0]} 👋</h1><p className="mt-2 text-muted-foreground">Dale a cada idea su propio espacio.</p></div><Button disabled><Plus data-icon="inline-start" aria-hidden="true" /> Nueva idea</Button></div>
      {dataError && <Alert variant="destructive" className="mb-7"><AlertTitle>No se pudieron cargar los datos</AlertTitle><AlertDescription>Comprueba que la migración de la base de datos esté aplicada.</AlertDescription></Alert>}
      <div className="grid gap-5 sm:grid-cols-2"><Card className="border-0 bg-pastel-sky"><CardHeader><CardDescription className="text-foreground/70">Ideas en tu espacio</CardDescription><CardTitle className="text-4xl font-semibold">{ideasResult.count ?? 0}</CardTitle></CardHeader><CardContent><Lightbulb className="size-6" aria-hidden="true" /></CardContent></Card><Card className="border-0 bg-pastel-mint"><CardHeader><CardDescription className="text-foreground/70">Proyectos en marcha</CardDescription><CardTitle className="text-4xl font-semibold">{projectsResult.count ?? 0}</CardTitle></CardHeader><CardContent><FolderKanban className="size-6" aria-hidden="true" /></CardContent></Card></div>
      <Card className="mt-7 border-0"><CardHeader><div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender"><Sparkles className="size-6 text-primary" aria-hidden="true" /></div><CardTitle className="text-xl font-semibold">Tu taller está preparado</CardTitle><CardDescription className="max-w-xl leading-relaxed">Ya tienes tu cuenta y tu espacio personal. En la siguiente etapa podrás capturar ideas, convertirlas en proyectos e invitar a otras personas.</CardDescription></CardHeader><CardContent><p className="inline-flex items-center gap-2 text-sm font-medium text-primary">Fundaciones listas <ArrowRight className="size-4" aria-hidden="true" /></p></CardContent></Card>
    </main></SidebarInset>
  </SidebarProvider>;
}
