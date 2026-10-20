"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Preferred riders is retired (Own bikers T9, owner 2026-10-20): its screen is gone, and a bookmark lands on Account. */
export default function RidersPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/account");
  }, [router]);
  return null;
}
