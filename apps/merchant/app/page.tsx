"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Root route. AccessGate (components/AccessGate.tsx) has already sent a signed-out visitor to /login
 * before this renders; a signed-in one lands on the dashboard's home section. A static export has no
 * server redirect, so this one happens in the browser.
 */
export default function RootPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/queue");
  }, [router]);
  return null;
}
