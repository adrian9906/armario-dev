import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Archive, ArrowLeft, FolderKanban, Lightbulb, RotateCcw } from "lucide-react";
import { setIdeaArchived } from "@/app/dashboard/actions";
import { IdeaForm } from "@/components/phase-one-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const kindNames: Record<string, string> = { web: "Web", mobile: "Móvil", frontend: "Frontend", backend: "Backend", mixed: "Frontend y backend", other: "Otro", undecided: "Por definir" };
const date = (value: string, month: "long" | "short" = "short") => new Intl.DateTimeFormat("es", { day: "numeric", month, year: "numeric" }).format(new Date(value));

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  const db = createClient();
  const { data: idea } = await db.from("ideas").select("id,workspace_id,title,description,kind,tags,status,created_at,updated_at").eq("id", id).maybeSingle();
  if (!idea) notFound();
  const [space, membership, project] = await Promise.all([
    db.from("workspaces").select("name").eq("id", idea.workspace_id).maybeSingle(),
    db.from("workspace_memberships").select("role").eq("workspace_id", idea.workspace_id).eq("user_id", userId).maybeSingle(),
    db.from("projects").select("id").eq("origin_idea_id", id).maybeSingle(),
  ]);
  if (!space.data || !membership.data) notFound();
  const canEdit = ["owner", "admin", "editor"].includes(membership.data.role);
  const converted = idea.status === "converted" || !!project.data;

  return <main className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 lg:py-12">
    <Link href={`/dashboard?workspace=${idea.workspace_id}&view=ideas`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a {space.data.name}</Link>
    <div className="mt-10 flex flex-wrap items-start justify-between gap-4">
      <div><Badge className="mb-4 border-0 bg-pastel-lavender px-4 py-2 text-foreground">{converted ? "Convertida en proyecto" : idea.status === "archived" ? "Idea archivada" : "Idea en crecimiento"}</Badge><h1 className="text-[2.35rem] leading-[1.12] font-bold tracking-[-0.045em] sm:text-[3rem]">{idea.title}</h1><p className="mt-3 text-base leading-relaxed text-muted-foreground">Creada el {date(idea.created_at, "long")} · {space.data.name}</p></div>
      <div className="flex flex-wrap gap-2">
        {project.data && <Button render={<Link href={`/projects/${project.data.id}`} />}><FolderKanban aria-hidden /> Abrir proyecto</Button>}
        {!converted && canEdit && idea.status === "active" && <Button render={<Link href={`/ideas/${id}/convertir`} />}><FolderKanban aria-hidden /> Convertir en proyecto</Button>}
        {!converted && canEdit && <form action={setIdeaArchived}><input type="hidden" name="workspace_id" value={idea.workspace_id} /><input type="hidden" name="idea_id" value={idea.id} /><input type="hidden" name="status" value={idea.status === "archived" ? "active" : "archived"} /><Button type="submit" variant="outline">{idea.status === "archived" ? <RotateCcw aria-hidden /> : <Archive aria-hidden />}{idea.status === "archived" ? "Restaurar" : "Archivar"}</Button></form>}
      </div>
    </div>
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="space-y-6"><Card><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-sky"><Lightbulb aria-hidden /></div><CardTitle>Notas</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap text-base leading-7 text-foreground/80">{idea.description || "Todavía no hay notas para esta idea."}</p></CardContent></Card>
        {canEdit && !converted && <Card><CardHeader><CardTitle>Desarrollar la idea</CardTitle><CardDescription>Cambia el título, añade contexto y organiza etiquetas.</CardDescription></CardHeader><CardContent><IdeaForm workspaceId={idea.workspace_id} idea={{ id: idea.id, title: idea.title, description: idea.description, kind: idea.kind, tags: idea.tags }} /></CardContent></Card>}
      </div>
      <Card className="h-fit"><CardHeader><CardTitle className="text-base">De un vistazo</CardTitle></CardHeader><CardContent className="space-y-5"><div><p className="text-xs text-muted-foreground">Tipo inicial</p><p className="mt-1 text-sm font-medium">{kindNames[idea.kind ?? "undecided"]}</p></div><div><p className="text-xs text-muted-foreground">Etiquetas</p><div className="mt-2 flex flex-wrap gap-2">{idea.tags.length ? idea.tags.map((tag: string) => <Badge variant="outline" key={tag}>{tag}</Badge>) : <span className="text-sm text-muted-foreground">Sin etiquetas</span>}</div></div><div><p className="text-xs text-muted-foreground">Último cambio</p><p className="mt-1 text-sm font-medium">{date(idea.updated_at)}</p></div></CardContent></Card>
    </div>
  </main>;
}
