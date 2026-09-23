import Link from "next/link";
import { redirect } from "next/navigation";
import { SignIn, UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { KeyRound, MailCheck, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { AcceptInviteForm } from "@/components/accept-invite-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function Unavailable({ invalid = false }: { invalid?: boolean }) {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <Brand />
      <Card className="mt-12">
        <CardHeader>
          <CardTitle>{invalid ? "Enlace no válido" : "Invitación no disponible"}</CardTitle>
          <CardDescription>
            {invalid
              ? "Abre el enlace completo que recibiste por correo."
              : "Es posible que haya vencido, se haya revocado o ya se haya utilizado."}
          </CardDescription>
        </CardHeader>
        <CardContent><Button variant="outline" render={<Link href="/dashboard" />}>Ir al inicio</Button></CardContent>
      </Card>
    </main>
  );
}

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const { userId } = await auth();
  if (typeof id !== "string" || !uuidPattern.test(id)) return <Unavailable invalid />;

  const db = createAdminClient();
  const { data: invite } = await db.from("workspace_invitations")
    .select("email,role,status,expires_at,workspace_id,accepted_by").eq("id", id).maybeSingle();
  if (invite?.status === "accepted" && userId && invite.accepted_by === userId) {
    redirect(`/dashboard?workspace=${invite.workspace_id}&view=overview`);
  }
  if (!invite || invite.status !== "pending" || new Date(invite.expires_at) <= new Date()) {
    return <Unavailable />;
  }

  const [{ data: space }, user] = await Promise.all([
    db.from("workspaces").select("name").eq("id", invite.workspace_id).maybeSingle(),
    userId ? currentUser() : Promise.resolve(null),
  ]);
  const matchingAccount = user?.emailAddresses.some((address) =>
    address.emailAddress.toLowerCase() === invite.email
    && address.verification?.status === "verified");
  const invitationUrl = `/invitaciones/aceptar?id=${encodeURIComponent(id)}`;
  const roleName = invite.role === "admin" ? "Administrador" : invite.role === "editor" ? "Editor" : "Lector";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8">
      <Brand />
      <Card className="mt-12 overflow-hidden">
        <div className="h-2 bg-pastel-mint" />
        <CardHeader>
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-pastel-mint"><MailCheck aria-hidden /></div>
          <CardTitle className="text-2xl">Te invitaron a {space?.name ?? "un espacio"}</CardTitle>
          <CardDescription>
            La invitación está asociada a {invite.email}. El código confirma tu acceso a este espacio concreto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-2xl bg-pastel-lavender/60 p-4"><Users aria-hidden /><span className="text-sm">Rol: {roleName}</span></div>
            <div className="flex items-center gap-3 rounded-2xl bg-pastel-sky/60 p-4"><KeyRound aria-hidden /><span className="text-sm">Código de un solo uso</span></div>
          </div>
          {userId ? matchingAccount ? (
            <AcceptInviteForm invitationId={id} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-destructive">La cuenta abierta no coincide con {invite.email}. Cambia de cuenta para continuar.</p>
              <UserButton />
            </div>
          ) : (
            <div>
              <p className="mb-4 text-sm text-muted-foreground">Inicia sesión o crea una cuenta con el correo invitado. Después te pediremos el código.</p>
              <SignIn routing="hash" forceRedirectUrl={invitationUrl} />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
