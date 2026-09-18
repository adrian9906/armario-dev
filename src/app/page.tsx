import Link from "next/link";
import { ArrowRight, Check, FolderKanban, Lightbulb, ListTodo, Shapes } from "lucide-react";
import { Brand } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const steps = [
  { number: "01", title: "Captura la idea", copy: "Guarda el problema, las primeras notas y todo lo que todavía está por definir.", icon: Lightbulb, color: "bg-pastel-mint" },
  { number: "02", title: "Dale estructura", copy: "Convierte esa idea en un proyecto con requisitos, módulos y prioridades claras.", icon: Shapes, color: "bg-pastel-sky" },
  { number: "03", title: "Hazla avanzar", copy: "Comparte el trabajo en tareas y checklist para saber cuál es el siguiente paso.", icon: ListTodo, color: "bg-pastel-lavender" },
];

export default function Home() {
  return <div className="min-h-dvh overflow-hidden bg-background">
    <header className="border-b border-border/70 bg-card/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:flex-nowrap sm:px-8">
        <Brand />
        <div className="ml-auto flex items-center gap-2"><Button variant="ghost" render={<Link href="/sign-in" />}>Entrar</Button><Button render={<Link href="/sign-up" />}>Crear cuenta <ArrowRight data-icon="inline-end" aria-hidden /></Button></div>
      </div>
    </header>

    <main>
      <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:pb-32 lg:pt-28">
        <div>
          <Badge variant="secondary" className="mb-8 px-3.5 py-1.5 text-sm">Tu espacio de trabajo, desde la primera idea</Badge>
          <h1 className="max-w-2xl text-[clamp(3.1rem,6vw,5.35rem)] leading-[1.06] font-bold tracking-[-0.065em]">Cada idea tiene <span className="text-primary">su lugar.</span></h1>
          <p className="mt-7 max-w-[34rem] text-lg leading-[1.7] text-muted-foreground sm:text-xl">De una nota rápida a un proyecto real. Organiza ideas, decisiones y próximos pasos en un taller claro para ti y tu equipo.</p>
          <div className="mt-10 flex flex-wrap items-center gap-3"><Button size="lg" render={<Link href="/sign-up" />}>Empezar ahora <ArrowRight data-icon="inline-end" aria-hidden /></Button><Button size="lg" variant="outline" render={<Link href="/sign-in" />}>Ya tengo cuenta</Button></div>
          <p className="mt-7 text-sm font-medium text-muted-foreground">Tus ideas, proyectos y tareas en un mismo sitio.</p>
        </div>

        <div className="relative rounded-[26px] bg-pastel-lavender/60 p-4 sm:p-7">
          <div className="rounded-[19px] border border-border/70 bg-card p-5 shadow-[0_16px_48px_rgb(51_51_51_/_0.08)] sm:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-5"><div className="flex items-center gap-2.5 text-sm font-semibold"><span className="flex size-8 items-center justify-center rounded-lg bg-pastel-mint"><FolderKanban className="size-4" aria-hidden /></span> Mi taller <span className="font-normal text-muted-foreground">/ Proyectos</span></div><span className="text-xs font-medium text-muted-foreground">Vista general</span></div>
            <div className="pt-7"><p className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground">Proyecto en marcha</p><h2 className="mt-2 text-[1.7rem] font-bold tracking-tight">Un huerto de proyectos</h2><p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-muted-foreground">Un lugar para reunir ideas y convertirlas en trabajo concreto.</p></div>
            <div className="mt-7 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl bg-pastel-sky p-5"><Lightbulb className="mb-7 size-5" aria-hidden /><p className="font-heading text-lg font-bold">Ideas</p><p className="mt-1 text-sm">Todo comienza aquí</p></div><div className="rounded-2xl bg-pastel-mint p-5"><Shapes className="mb-7 size-5" aria-hidden /><p className="font-heading text-lg font-bold">Proyectos</p><p className="mt-1 text-sm">Dale forma a cada plan</p></div></div>
            <div className="mt-3 rounded-2xl border border-border/70 bg-background p-5"><div className="mb-4 flex items-center justify-between gap-3"><span className="font-heading text-base font-bold">Próximos pasos</span><Badge variant="outline">2 de 3</Badge></div><div className="flex flex-col gap-3 text-sm"><p className="flex items-center gap-3"><Check className="size-5 rounded-full bg-primary p-1 text-primary-foreground" aria-hidden /> Definir el objetivo</p><p className="flex items-center gap-3"><Check className="size-5 rounded-full bg-primary p-1 text-primary-foreground" aria-hidden /> Elegir los módulos</p><p className="flex items-center gap-3 text-muted-foreground"><span className="size-5 rounded-full border border-border" /> Preparar el primer flujo</p></div></div>
          </div>
        </div>
      </section>

      <section className="border-t border-border/70 bg-card py-20 sm:py-24"><div className="mx-auto max-w-7xl px-5 sm:px-8"><div className="mb-11 max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Cómo funciona</p><h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-[2.6rem]">De una nota a un plan que avanza.</h2><p className="mt-4 text-lg leading-relaxed text-muted-foreground">Un camino sencillo para desarrollar una idea sin perder el contexto.</p></div><div className="grid gap-5 md:grid-cols-3">{steps.map((step) => <Card key={step.number} className="border-0 bg-background shadow-none"><CardHeader className="gap-4"><div className={`flex size-12 items-center justify-center rounded-xl ${step.color}`}><step.icon className="size-5" aria-hidden /></div><span className="text-xs font-bold tracking-[0.15em] text-primary">PASO {step.number}</span><CardTitle className="text-xl">{step.title}</CardTitle><CardDescription>{step.copy}</CardDescription></CardHeader><CardContent><span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">Sigue tu ritmo <ArrowRight className="size-4" aria-hidden /></span></CardContent></Card>)}</div></div></section>
    </main>
    <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground sm:px-8"><Brand /><span>Un lugar para imaginar y construir.</span></footer>
  </div>;
}
