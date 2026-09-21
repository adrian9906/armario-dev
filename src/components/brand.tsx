import Link from "next/link";
import { PanelsTopLeft } from "lucide-react";

export function Brand({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-3 font-heading font-bold tracking-[-0.04em] text-foreground transition-opacity hover:opacity-80">
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_5px_14px_color-mix(in_srgb,var(--primary)_20%,transparent)]" aria-hidden="true">
        <PanelsTopLeft className="size-5" strokeWidth={1.8} />
      </span>
      {!compact && <span className="whitespace-nowrap text-[1.35rem] group-data-[collapsible=icon]:hidden sm:text-[1.5rem]">Armario <span className="text-primary">Dev</span></span>}
    </Link>
  );
}
