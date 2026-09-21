import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DocumentationPageShell({ projectId, projectTitle, title, description, children }: {
  projectId: string; projectTitle: string; title: string; description: string; children: React.ReactNode;
}) {
  return <main className="mx-auto min-h-screen max-w-5xl px-5 py-8 sm:px-8">
    <Brand />
    <Link href={`/projects/${projectId}?view=documentation`} className="mt-9 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden /> Volver a la documentación</Link>
    <div className="mt-10"><p className="text-sm font-semibold text-primary">{projectTitle}</p><h1 className="mt-2 text-[2.35rem] font-bold tracking-[-0.045em] sm:text-[3rem]">{title}</h1><p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{description}</p></div>
    <Card className="mt-8"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>
  </main>;
}
