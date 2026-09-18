import { createHash } from "node:crypto";
import Link from "next/link";
import { SignIn, UserButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { MailCheck, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { AcceptInviteForm } from "@/components/accept-invite-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const { userId } = await auth();
  const validToken = typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
  if (!validToken) return <main className="mx-auto max-w-2xl p-8"><Brand /><Card className="mt-12"><CardHeader><CardTitle>Enlace no válido</CardTitle><CardDescription>Pide una nueva invitación a la persona que administra el espacio.</CardDescription></CardHeader><CardContent><Button variant="outline" render={<Link href="/dashboard" />}>Ir al inicio</Button></CardContent></Card></main>;
  const db = createAdminClient();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: invite } = await db.from("workspace_invitations")
    .select("email,role,status,expires_at,workspace_id").eq("token_hash", hash).maybeSingle();
  if (!invite || invite.status !== "pending" || new Date(invite.expires_at) <= new Date())
    return <main className="mx-auto max-w-2xl p-8"><Brand /><Card className="mt-12"><CardHeader><CardTitle>Invitación no disponible</CardTitle><CardDescription>Es posible que haya vencido, se haya revocado o ya se haya usado. Pide una nueva invitación.</CardDescription></CardHeader><CardContent><Button variant="outline" render={<Link href="/dashboard" />}>Ir al inicio</Button></CardContent></Card></main>;
  const [{ data: space }, user] = await Promise.all([
    db.from("workspaces").select("name").eq("id", invite.workspace_id).maybeSingle(),
    userId ? currentUser() : Promise.resolve(null),
  ]);
  const matchingAccount = user?.emailAddresses.some((address) => address.emailAddress.toLowerCase() === invite.email && address.verification?.status === "verified");
  return <main className="mx-auto min-h-screen max-w-3xl px-5 py-8"><Brand /><Card className="mt-12"><CardHeader><div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-pastel-mint"><MailCheck aria-hidden /></div><CardTitle className="text-2xl">Te invitaron a {space?.name ?? "un espacio"}</CardTitle><CardDescription>Con el correo {invite.email}. Una vez aceptes, podrás colaborar según el rol asignado.</CardDescription></CardHeader><CardContent className="space-y-5"><div className="flex items-center gap-3 rounded-2xl bg-pastel-lavender/60 p-4"><Users aria-hidden /><span className="text-sm">Rol: {invite.role === "admin" ? "Administrador" : invite.role === "editor" ? "Editor" : "Lector"}</span></div>{userId ? matchingAccount ? <AcceptInviteForm token={token} /> : <div className="space-y-3"><p className="text-sm text-destructive">La cuenta abierta no coincide con {invite.email}. Cambia de cuenta para aceptar.</p><UserButton /></div> : <div><p className="mb-4 text-sm text-muted-foreground">Inicia sesión o crea una cuenta con el correo invitado.</p><SignIn routing="hash" forceRedirectUrl={`/invitaciones/aceptar?token=${token}`} /></div>}</CardContent></Card></main>;
}
