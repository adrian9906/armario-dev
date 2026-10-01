import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DocumentationPageShell({ projectId, projectTitle, title, description, children }: {
  projectId: string; projectTitle: string; title: string; description: string; children: React.ReactNode;
}) {
  return <main className="workspace-canvas max-w-6xl">
    <Link href={`/projects/${projectId}?view=documentation`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden /> Volver a la documentación</Link>
    <div className="mt-9"><p className="workspace-kicker">{projectTitle}</p><h1 className="workspace-title mt-5">{title}</h1><p className="workspace-subtitle mt-4">{description}</p></div>
    <Card className="content-panel mt-8"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>
  </main>;
}
