"use client";

import { useState, useTransition } from "react";
import { toggleChecklistItem } from "@/app/projects/actions";
import { Checkbox } from "@/components/ui/checkbox";

export function ChecklistToggle({ projectId, taskId, itemId, checked, content }: { projectId: string; taskId: string; itemId: string; checked: boolean; content: string }) {
  const [completed, setCompleted] = useState(checked);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle() {
    const next = !completed;
    setCompleted(next);
    setError("");
    const form = new FormData();
    form.set("project_id", projectId);
    form.set("task_id", taskId);
    form.set("item_id", itemId);
    startTransition(async () => {
      try {
        await toggleChecklistItem(form);
      } catch {
        setCompleted(!next);
        setError("No se pudo guardar este paso. Inténtalo de nuevo.");
      }
    });
  }

  return <div>
    <div className="flex items-center gap-3">
      <Checkbox id={`check-${itemId}`} checked={completed} disabled={pending} onCheckedChange={toggle} aria-label={completed ? `Marcar pendiente: ${content}` : `Completar: ${content}`} />
      <label htmlFor={`check-${itemId}`} className={`cursor-pointer text-sm ${completed ? "text-muted-foreground line-through" : ""}`}>{content}</label>
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}
