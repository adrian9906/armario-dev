import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { getSupabaseConfig } from "@/lib/supabase/env";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <main className="min-h-screen px-5 py-7"><div className="mx-auto max-w-6xl"><Brand /></div><div className="mx-auto mt-16 flex max-w-6xl flex-col items-center gap-7"><p className="rounded-full bg-pastel-mint px-4 py-2 text-xs font-semibold uppercase tracking-widest">Tu taller de ideas</p><AuthForm mode="login" configured={!!getSupabaseConfig()} confirmationError={error === "confirm"} /></div></main>;
}
