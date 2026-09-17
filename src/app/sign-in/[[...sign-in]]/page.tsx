import { SignIn } from "@clerk/nextjs";
import { Brand } from "@/components/brand";

export default function SignInPage() {
  return (
    <main className="min-h-screen px-5 py-7">
      <div className="mx-auto max-w-6xl"><Brand /></div>
      <div className="mx-auto mt-14 flex max-w-6xl flex-col items-center gap-7">
        <p className="rounded-full bg-pastel-mint px-4 py-2 text-xs font-semibold uppercase tracking-widest">Tu taller de ideas</p>
        <SignIn fallbackRedirectUrl="/dashboard" />
      </div>
    </main>
  );
}
