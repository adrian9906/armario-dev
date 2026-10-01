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
  return <main className="workspace-canvas max-w-4xl"><Link href={`/projects/${id}?view=requirements`} className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" aria-hidden /> Volver a los requisitos</Link><Badge className="workspace-kicker mt-9 mb-5 bg-pastel-peach">Definir el producto</Badge><h1 className="workspace-title">Nuevo requisito</h1><p className="workspace-subtitle mt-4">Explica qué debe cumplir {project.title} y cómo lo verificarás.</p><Card className="content-panel mt-8"><CardHeader><div className="flex size-12 items-center justify-center rounded-2xl bg-pastel-mint"><ClipboardList aria-hidden /></div><CardTitle>Definición</CardTitle><CardDescription>Después podrás relacionarlo con las tareas que lo implementan.</CardDescription></CardHeader><CardContent><RequirementForm projectId={id} /></CardContent></Card></main>;
}
