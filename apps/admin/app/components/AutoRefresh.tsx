"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a live queue page current for an operator who leaves the tab open. The page is a server
 * component that fetches once per navigation; every `intervalMs`, while the tab is visible, this calls
 * router.refresh() to re-run it against the `no-store` feed — rows re-render in place (no navigation,
 * no flicker, client state such as an open editor survives). A hidden tab doesn't poll. Renders nothing.
 */
export function AutoRefresh({ intervalMs }: { intervalMs: number }): null {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
