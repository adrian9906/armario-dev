import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3 font-semibold tracking-tight text-foreground">
      <span className="relative flex size-9 items-center justify-center" aria-hidden="true">
        <span className="absolute top-0 left-3 size-4 rounded-full bg-primary" />
        <span className="absolute top-2 right-0 size-4 rounded-full bg-pastel-sky" />
        <span className="absolute bottom-0 right-1 size-4 rounded-full bg-pastel-mint" />
        <span className="absolute bottom-0 left-1 size-4 rounded-full bg-pastel-peach" />
        <span className="absolute top-2 left-0 size-4 rounded-full bg-pastel-lavender" />
        <span className="relative size-2 rounded-full bg-card" />
      </span>
      {!compact && <span className="text-2xl">semilla<span className="text-primary">.</span></span>}
    </Link>
  );
}
