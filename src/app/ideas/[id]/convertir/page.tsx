import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderKanban, Sparkles } from "lucide-react";
import { Brand } from "@/components/brand";
import { ConvertIdeaForm } from "@/components/project-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ConvertIdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  const db = createClient();
  const { data: idea } = await db.from("ideas").select("id,workspace_id,title,description,kind,status").eq("id", id).maybeSingle();
  if (!idea) notFound();
  const [{ data: membership }, { data: existing }] = await Promise.all([
    db.from("workspace_memberships").select("role").eq("workspace_id", idea.workspace_id).eq("user_id", userId).maybeSingle(),
    db.from("projects").select("id").eq("origin_idea_id", id).maybeSingle(),
  ]);
  if (!membership) notFound();
  const canEdit = ["owner", "admin", "editor"].includes(membership.role);
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-8"><Brand /><Link href={`/ideas/${id}`} className="mt-9 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a la idea</Link><Badge className="mt-10 mb-4 block w-fit border-0 bg-pastel-mint px-4 py-2 text-foreground">De idea a proyecto</Badge><h1 className="text-[2.35rem] leading-[1.12] font-bold tracking-[-0.045em]">{idea.title}</h1><p className="mt-2 text-muted-foreground">La idea conserva su origen. Ahora elige la estructura inicial para empezar a trabajar.</p><Card className="mt-8"><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender"><FolderKanban aria-hidden /></div><CardTitle>{existing ? "Proyecto ya creado" : "Preparar el proyecto"}</CardTitle><CardDescription>{existing ? "Esta idea ya tiene un proyecto vinculado." : "Podrás ajustar tipo, módulos y etapa más adelante sin perder datos."}</CardDescription></CardHeader><CardContent>{existing ? <Button render={<Link href={`/projects/${existing.id}`} />}>Abrir proyecto</Button> : idea.status !== "active" || !canEdit ? <p className="text-sm text-muted-foreground">Esta idea no se puede convertir ahora.</p> : <ConvertIdeaForm ideaId={id} suggestedKind={idea.kind} />}</CardContent></Card><p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="size-4" aria-hidden /> Las notas, autoría y fecha originales se guardan como referencia.</p></main>;
}
