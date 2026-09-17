"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Mail, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/browser";

export function AuthForm({ mode, configured, confirmationError = false }: {
  mode: "login" | "signup";
  configured: boolean;
  confirmationError?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const router = useRouter();
  const signup = mode === "signup";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!configured) return;
    setError(null);
    setPending(true);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const supabase = createClient();

    try {
      if (signup) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: String(data.get("name") ?? "").trim() },
            emailRedirectTo: `${window.location.origin}/auth/confirm`,
          },
        });
        if (error) throw error;
        setSent(true);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la solicitud.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-0 bg-card p-3 shadow-xl">
      <CardHeader className="gap-3 px-5 pt-5">
        <div className="flex size-11 items-center justify-center rounded-2xl bg-pastel-lavender text-primary">
          <Sparkles className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl font-semibold">{signup ? "Crea tu espacio" : "Qué bueno verte"}</CardTitle>
        <CardDescription>{signup ? "Tus ideas empiezan aquí. Invita a tu equipo cuando quieras." : "Entra para seguir dando forma a tus proyectos."}</CardDescription>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {!configured && <Alert className="mb-5"><AlertTitle>Falta conectar Supabase</AlertTitle><AlertDescription>Agrega la URL y la clave publicable en .env.local para habilitar el acceso.</AlertDescription></Alert>}
        {confirmationError && <Alert variant="destructive" className="mb-5"><AlertDescription>El enlace de confirmación no es válido o expiró. Solicita uno nuevo.</AlertDescription></Alert>}
        {error && <Alert variant="destructive" className="mb-5"><AlertDescription>{error}</AlertDescription></Alert>}
        {sent ? (
          <Alert><Mail aria-hidden="true" /><AlertTitle>Revisa tu correo</AlertTitle><AlertDescription>Te enviamos un enlace para confirmar tu cuenta.</AlertDescription></Alert>
        ) : (
          <form onSubmit={submit}>
            <FieldGroup>
              {signup && <Field><FieldLabel htmlFor="name">Tu nombre</FieldLabel><Input id="name" name="name" autoComplete="name" required maxLength={120} placeholder="Ada Lovelace" /></Field>}
              <Field><FieldLabel htmlFor="email">Correo electrónico</FieldLabel><Input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@ejemplo.com" /></Field>
              <Field><FieldLabel htmlFor="password">Contraseña</FieldLabel><Input id="password" name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={6} placeholder="Mínimo 6 caracteres" /></Field>
              <Button type="submit" size="lg" disabled={!configured || pending} className="mt-2 w-full">
                {pending ? "Un momento…" : signup ? "Crear cuenta" : "Entrar"}<ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Button>
            </FieldGroup>
          </form>
        )}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {signup ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}{" "}
          <Link className="font-semibold text-primary underline-offset-4 hover:underline" href={signup ? "/login" : "/signup"}>{signup ? "Inicia sesión" : "Regístrate"}</Link>
        </p>
      </CardContent>
    </Card>
  );
}
