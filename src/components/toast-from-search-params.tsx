"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function ToastFromSearchParams() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const displayed = useRef("");
  const message = searchParams.get("toast");
  const current = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    if (!message || displayed.current === current) return;
    displayed.current = current;
    toast.success(message);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("toast");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [current, message, pathname, router, searchParams]);

  return null;
}
