"use client";

import Image from "next/image";
import { Boxes } from "lucide-react";
import { useState } from "react";
import { cn } from "cn";
import { technologyByName, type TechnologyCatalogItem } from "@/lib/documentation-model";

export function TechnologyIcon({
  technology,
  name,
  className,
}: {
  technology?: TechnologyCatalogItem;
  name?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const item = technology ?? (name ? technologyByName(name) : undefined);

  return (
    <span
      className={cn("flex size-7 shrink-0 items-center justify-center rounded-md bg-background/80", className)}
      aria-hidden="true"
    >
      {!item || failed ? (
        <Boxes className="size-4 text-muted-foreground" />
      ) : (
        <Image
          src={item.icon}
          alt=""
          width={20}
          height={20}
          unoptimized
          className="size-5 object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
