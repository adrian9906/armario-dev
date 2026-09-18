"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { acceptInvitation } from "@/app/invitaciones/aceptar/actions";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Uniéndote…" : "Aceptar invitación"}</Button>;
}

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvitation, { error: null });
  return <form action={action} className="space-y-4"><input type="hidden" name="token" value={token} />{state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}<Submit /></form>;
}
