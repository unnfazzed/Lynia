"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the SOS console live for an operator who staffs the safety desk with the tab left open (the
 * natural way to run it). The page itself is a server component that fetches once per navigation, so
 * without this a newly-raised alert wouldn't appear until a manual reload — contradicting the
 * empty-state promise that alerts "land here the moment they fire". Every ~35s, while the tab is
 * visible, it calls router.refresh() to re-run the server component against the live `no-store` feed;
 * that re-renders the rows in place (no full navigation, no flicker). Skips refreshing while the tab is
 * hidden so a backgrounded desk doesn't poll needlessly. Renders nothing.
 */
export function SosAutoRefresh(): null {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        router.refresh();
      }
    }, 35_000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}
