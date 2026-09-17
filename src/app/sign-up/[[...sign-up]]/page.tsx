import { SignUp } from "@clerk/nextjs";
import { Brand } from "@/components/brand";

export default function SignUpPage() {
  return (
    <main className="min-h-screen px-5 py-7">
      <div className="mx-auto max-w-6xl"><Brand /></div>
      <div className="mx-auto mt-14 flex max-w-6xl flex-col items-center gap-7">
        <p className="rounded-full bg-pastel-sky px-4 py-2 text-xs font-semibold uppercase tracking-widest">Todo empieza con una idea</p>
        <SignUp fallbackRedirectUrl="/dashboard" />
      </div>
    </main>
  );
}
