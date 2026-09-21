import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { RequirementForm } from "@/components/project-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireEditableProject } from "@/lib/project-access";

export const dynamic = "force-dynamic";

export default async function NewRequirementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await requireEditableProject(id);
  return <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 lg:py-12"><Link href={`/projects/${id}?view=requirements`} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a los requisitos</Link><Badge className="mt-10 mb-4 block w-fit border-0 bg-pastel-peach px-4 py-2 text-foreground">Definir el producto</Badge><h1 className="text-[2.35rem] leading-[1.12] font-bold tracking-[-0.045em]">Nuevo requisito</h1><p className="mt-2 text-muted-foreground">Explica qué debe cumplir {project.title} y cómo lo verificarás.</p><Card className="mt-8"><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-mint"><ClipboardList aria-hidden /></div><CardTitle>Definición</CardTitle><CardDescription>Después podrás relacionarlo con las tareas que lo implementan.</CardDescription></CardHeader><CardContent><RequirementForm projectId={id} /></CardContent></Card></main>;
}
