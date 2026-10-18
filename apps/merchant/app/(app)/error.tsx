"use client";

import { usePathname } from "next/navigation";
import { Kitchen } from "../components/Kitchen";
import { CrashState, screenForPath } from "../components/CrashState";

/**
 * A signed-in screen that crashed. This boundary sits inside the (app) layout, so the socket and the
 * ringing alarm (KitchenConnectionProvider, RingingHost) stay up while it shows: a broken Menu screen
 * must never silence a new order. The tab bar stays too, with the crashed screen's tab lit. If the shell
 * itself throws, the root boundary (app/error.tsx) catches it instead.
 */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const pathname = usePathname();
  return (
    <Kitchen active={screenForPath(pathname)}>
      <CrashState onRetry={reset} />
    </Kitchen>
  );
}
