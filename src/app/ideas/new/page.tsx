import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ArrowLeft, Lightbulb } from "lucide-react";
import { Brand } from "@/components/brand";
import { IdeaForm } from "@/components/phase-one-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewIdeaPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const { userId } = await auth.protect();
  const { workspace: workspaceId } = await searchParams;
  if (!workspaceId) notFound();
  const db = createClient();
  const [space, membership] = await Promise.all([
    db.from("workspaces").select("id,name").eq("id", workspaceId).maybeSingle(),
    db.from("workspace_memberships").select("role").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
  ]);
  if (!space.data || !["owner", "admin", "editor"].includes(membership.data?.role ?? "")) notFound();
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8"><Brand /><Link href={`/dashboard?workspace=${workspaceId}&view=ideas`} className="mt-9 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a las ideas</Link><Badge className="mt-10 mb-4 block w-fit border-0 bg-pastel-lavender px-4 py-2 text-foreground">Nueva idea ✦</Badge><h1 className="text-3xl font-semibold tracking-tight">Una idea empieza aquí</h1><p className="mt-2 text-muted-foreground">Captura lo esencial. Podrás volver para añadir detalles.</p><Card className="mt-8"><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-sky"><Lightbulb aria-hidden /></div><CardTitle>Idea para {space.data.name}</CardTitle><CardDescription>Solo las personas de este espacio podrán verla.</CardDescription></CardHeader><CardContent><IdeaForm workspaceId={workspaceId} /></CardContent></Card></main>;
}
