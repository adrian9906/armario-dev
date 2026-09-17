import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { getSupabaseConfig } from "@/lib/supabase/env";

export default function SignupPage() {
  return <main className="min-h-screen px-5 py-7"><div className="mx-auto max-w-6xl"><Brand /></div><div className="mx-auto mt-16 flex max-w-6xl flex-col items-center gap-7"><p className="rounded-full bg-pastel-sky px-4 py-2 text-xs font-semibold uppercase tracking-widest">Todo empieza con una idea</p><AuthForm mode="signup" configured={!!getSupabaseConfig()} /></div></main>;
}
