"use client";

import { useState } from "react";
import { FileCode2, Plus } from "lucide-react";
import { DiagramForm } from "@/components/documentation-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function CreateDiagramDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  return <Dialog open={open} onOpenChange={setOpen}>
    <Card className="h-full border-dashed bg-muted/25 transition-colors hover:bg-muted/45">
      <CardHeader>
        <span className="mb-2 flex size-11 items-center justify-center rounded-xl bg-pastel-mint text-foreground">
          <Plus aria-hidden />
        </span>
        <CardTitle>Nuevo diagrama</CardTitle>
        <CardDescription>Crea el plano y continúa trabajando en su página de detalle.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <FileCode2 data-icon="inline-start" aria-hidden />
          Crear diagrama
        </Button>
      </CardContent>
    </Card>

    <DialogContent className="max-w-6xl">
      <DialogHeader>
        <DialogTitle>Nuevo diagrama</DialogTitle>
        <DialogDescription>Parte de una plantilla editable. Al crearlo irás directamente a su historial y trazabilidad.</DialogDescription>
      </DialogHeader>
      <DiagramForm projectId={projectId} />
    </DialogContent>
  </Dialog>;
}
