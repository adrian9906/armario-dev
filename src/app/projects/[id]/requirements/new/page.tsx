import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { Brand } from "@/components/brand";
import { RequirementForm } from "@/components/project-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewRequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth.protect();
  const { id } = await params;
  const db = createClient();
  const { data: project } = await db.from("projects").select("workspace_id,title").eq("id", id).maybeSingle();
  if (!project) notFound();
  const { data: member } = await db.from("workspace_memberships").select("role")
    .eq("workspace_id", project.workspace_id).eq("user_id", userId).maybeSingle();
  if (!member || !["owner", "admin", "editor"].includes(member.role)) notFound();
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-8"><Brand /><Link href={`/projects/${id}?view=requirements`} className="mt-9 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a los requisitos</Link><Badge className="mt-10 mb-4 block w-fit border-0 bg-pastel-peach px-4 py-2 text-foreground">Definir el producto</Badge><h1 className="text-[2.35rem] leading-[1.12] font-bold tracking-[-0.045em]">Nuevo requisito</h1><p className="mt-2 text-muted-foreground">Explica qué debe cumplir {project.title} y cómo lo verificarás.</p><Card className="mt-8"><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-mint"><ClipboardList aria-hidden /></div><CardTitle>Definición</CardTitle><CardDescription>Después podrás relacionarlo con las tareas que lo implementan.</CardDescription></CardHeader><CardContent><RequirementForm projectId={id} /></CardContent></Card></main>;
}
