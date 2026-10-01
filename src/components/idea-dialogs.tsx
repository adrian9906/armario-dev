"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Lightbulb, Pencil, Plus, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { setIdeaArchivedInline, type FormState } from "@/app/dashboard/actions";
import { IdeaForm } from "@/components/phase-one-forms";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";

type IdeaValues = { id: string; title: string; description: string; kind: string | null; tags: string[]; status: string };
const initialState: FormState = { error: null, success: null };

export function CreateIdeaDialog({ workspaceId, compact = false, buttonLabel }: { workspaceId: string; compact?: boolean; buttonLabel?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const finish = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button />}><Plus data-icon="inline-start" />{buttonLabel ?? (compact ? "Crear la primera idea" : "Nueva idea")}</DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-sky"><Lightbulb aria-hidden /></span>
        <DialogTitle>Captura una nueva idea</DialogTitle>
        <DialogDescription>Guarda la chispa ahora. Podrás editarla, organizarla o convertirla en proyecto cuando esté lista.</DialogDescription>
      </DialogHeader>
      <IdeaForm workspaceId={workspaceId} presentation="modal" onSuccess={finish} />
    </DialogContent>
  </Dialog>;
}

export function IdeaCardActions({ workspaceId, idea }: { workspaceId: string; idea: IdeaValues }) {
  return <div className="flex items-center gap-2">
    <EditIdeaDialog workspaceId={workspaceId} idea={idea} />
    <ArchiveIdeaDialog workspaceId={workspaceId} idea={idea} />
  </div>;
}

function EditIdeaDialog({ workspaceId, idea }: { workspaceId: string; idea: IdeaValues }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const finish = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" size="sm" variant="outline" aria-label={`Editar ${idea.title}`} onClick={() => setOpen(true)}><Pencil data-icon="inline-start" /> Editar</Button>
    <DialogContent>
      <DialogHeader>
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender"><Sparkles aria-hidden /></span>
        <DialogTitle>Editar idea</DialogTitle>
        <DialogDescription>Refina el concepto sin salir de tu bandeja de ideas.</DialogDescription>
      </DialogHeader>
      <IdeaForm workspaceId={workspaceId} idea={idea} presentation="modal" onSuccess={finish} />
    </DialogContent>
  </Dialog>;
}

function ArchiveIdeaDialog({ workspaceId, idea }: { workspaceId: string; idea: IdeaValues }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(setIdeaArchivedInline, initialState);
  const router = useRouter();
  const restoring = idea.status === "archived";

  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    const timer = window.setTimeout(() => {
      setOpen(false);
      router.refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router, state.success]);

  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" size="sm" variant="ghost" aria-label={`${restoring ? "Restaurar" : "Archivar"} ${idea.title}`} onClick={() => setOpen(true)}>
      {restoring ? <RotateCcw data-icon="inline-start" /> : <Archive data-icon="inline-start" />}{restoring ? "Restaurar" : "Archivar"}
    </Button>
    <DialogContent className="max-w-md" showCloseButton={false}>
      <DialogHeader>
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-peach">{restoring ? <RotateCcw aria-hidden /> : <Archive aria-hidden />}</span>
        <DialogTitle>{restoring ? "¿Restaurar esta idea?" : "¿Archivar esta idea?"}</DialogTitle>
        <DialogDescription>{restoring ? <>“{idea.title}” volverá a aparecer entre tus ideas activas.</> : <>“{idea.title}” dejará la bandeja activa, pero podrás recuperarla cuando quieras.</>}</DialogDescription>
      </DialogHeader>
      <form action={action}>
        <input type="hidden" name="workspace_id" value={workspaceId} />
        <input type="hidden" name="idea_id" value={idea.id} />
        <input type="hidden" name="status" value={restoring ? "active" : "archived"} />
        {state.error && <FieldError className="mb-4">{state.error}</FieldError>}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
          <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonVariants({ variant: restoring ? "default" : "destructive" })}>
            {pending ? <Spinner data-icon="inline-start" /> : restoring ? <RotateCcw data-icon="inline-start" /> : <Archive data-icon="inline-start" />}{pending ? "Guardando…" : restoring ? "Sí, restaurar" : "Sí, archivar"}
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
