"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { LoaderCircle } from "lucide-react";
import { acceptInvitation } from "@/app/invitaciones/aceptar/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending && <LoaderCircle className="animate-spin" aria-hidden />}
      {pending ? "Verificando…" : "Verificar y entrar"}
    </Button>
  );
}

export function AcceptInviteForm({ invitationId }: { invitationId: string }) {
  const [state, action] = useActionState(acceptInvitation, { error: null });
  const [code, setCode] = useState("");
  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="invitation_id" value={invitationId} />
      <input type="hidden" name="code" value={code} />
      <Field data-invalid={Boolean(state.error)}>
        <FieldLabel htmlFor="invitation-code">Código de invitación</FieldLabel>
        <InputOTP
          id="invitation-code"
          value={code}
          onChange={setCode}
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          autoComplete="one-time-code"
          aria-invalid={Boolean(state.error)}
          containerClassName="justify-start"
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="size-11 text-base" />
            <InputOTPSlot index={1} className="size-11 text-base" />
            <InputOTPSlot index={2} className="size-11 text-base" />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} className="size-11 text-base" />
            <InputOTPSlot index={4} className="size-11 text-base" />
            <InputOTPSlot index={5} className="size-11 text-base" />
          </InputOTPGroup>
        </InputOTP>
        <FieldDescription>Está en el correo de invitación y vence a los siete días.</FieldDescription>
        {state.error && <FieldError>{state.error}</FieldError>}
      </Field>
      <Submit />
    </form>
  );
}
