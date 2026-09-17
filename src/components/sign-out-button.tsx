"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

export function SignOutButton() {
  const router = useRouter();
  return <Button variant="ghost" onClick={async () => { await createClient().auth.signOut(); router.push("/"); router.refresh(); }}><LogOut data-icon="inline-start" aria-hidden="true" /> Salir</Button>;
}
