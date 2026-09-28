"use client";

import { useState } from "react";
import { Unplug } from "lucide-react";
import { disconnectGitHub } from "@/app/github/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DisconnectGitHubDialog({ workspaceId, accountLogin }: { workspaceId: string; accountLogin: string }) {
  const [open, setOpen] = useState(false);

  return <Dialog open={open} onOpenChange={setOpen}>
    <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
      <Unplug data-icon="inline-start" aria-hidden />
      Desconectar
    </Button>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>¿Desconectar GitHub?</DialogTitle>
        <DialogDescription>Armario dejará de usar la instalación de @{accountLogin} en este espacio. No se eliminará la GitHub App ni ningún repositorio.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
        <form action={disconnectGitHub}>
          <input type="hidden" name="workspace_id" value={workspaceId} />
          <Button type="submit" variant="destructive">
            <Unplug data-icon="inline-start" aria-hidden />
            Sí, desconectar
          </Button>
        </form>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
