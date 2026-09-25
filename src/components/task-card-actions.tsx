"use client";

import { useCallback, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { setTaskStatus } from "@/app/projects/actions";
import { TaskForm, type TaskValues } from "@/components/project-forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Member = { user_id: string; name: string };

export function TaskCompletionToggle({ projectId, task, canToggle, children, className }: { projectId: string; task: TaskValues; canToggle: boolean; children?: ReactNode; className?: string }) {
  const [completed, setCompleted] = useOptimistic(task.status === "done");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function toggle() {
    if (!canToggle || pending) return;
    const next = !completed;
    const form = new FormData();
    form.set("project_id", projectId);
    form.set("task_id", task.id);
    form.set("status", next ? "done" : "todo");
    form.set("return_to", "inline");

    startTransition(async () => {
      setCompleted(next);
      try {
        await setTaskStatus(form);
        toast.success(next ? "Tarea marcada como hecha." : "Tarea marcada como pendiente.");
        router.refresh();
      } catch {
        toast.error("No se pudo actualizar la tarea.");
        router.refresh();
      }
    });
  }

  return <div
    data-completed={completed || undefined}
    className={cn("flex items-center gap-3 data-[completed]:[&_[data-task-title]]:text-muted-foreground data-[completed]:[&_[data-task-title]]:line-through data-[completed]:[&_[data-task-title]]:decoration-2", className)}
  >
    <Checkbox
      id={`task-done-${task.id}`}
      checked={completed}
      disabled={!canToggle || pending}
      onCheckedChange={toggle}
      aria-label={completed ? `Marcar pendiente: ${task.title}` : `Marcar hecha: ${task.title}`}
    />
    <label htmlFor={`task-done-${task.id}`} className="sr-only">{completed ? "Tarea hecha" : "Marcar tarea como hecha"}</label>
    {children}
  </div>;
}

export function EditTaskDialog({ projectId, task, members }: { projectId: string; task: TaskValues; members: Member[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const finish = useCallback(() => {
    setOpen(false);
    router.refresh();
  }, [router]);

  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" size="sm" variant="outline" aria-label={`Editar ${task.title}`} onClick={() => setOpen(true)}>
      <Pencil data-icon="inline-start" /> Editar
    </Button>
    <DialogContent>
      <DialogHeader>
        <span className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-pastel-lavender"><ListChecks aria-hidden /></span>
        <DialogTitle>Editar tarea</DialogTitle>
        <DialogDescription>Cambia los detalles, la persona responsable y las fechas. El avance se marca directamente desde la tarjeta.</DialogDescription>
      </DialogHeader>
      <TaskForm projectId={projectId} members={members} task={task} presentation="modal" onSuccess={finish} />
    </DialogContent>
  </Dialog>;
}
