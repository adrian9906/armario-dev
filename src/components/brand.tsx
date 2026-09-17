import Link from "next/link";
import { PanelsTopLeft } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="inline-flex items-center gap-3 font-semibold tracking-tight text-foreground">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true">
        <PanelsTopLeft className="size-5" />
      </span>
      {!compact && <span className="text-xl sm:text-2xl">Armario <span className="text-primary">Dev</span></span>}
    </Link>
  );
}
