import Link from "next/link";
import { PanelsTopLeft } from "lucide-react";

export function Brand({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-3 font-heading font-semibold tracking-[-0.045em] text-foreground transition-opacity hover:opacity-80">
      <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_18px_color-mix(in_srgb,var(--primary)_24%,transparent)] ring-4 ring-secondary" aria-hidden="true">
        <PanelsTopLeft className="size-4.5" strokeWidth={1.9} />
      </span>
      {!compact && <span className="whitespace-nowrap text-[1.3rem] group-data-[collapsible=icon]:hidden sm:text-[1.45rem]">Armario <span className="text-primary">Dev</span></span>}
    </Link>
  );
}
