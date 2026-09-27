import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { riderModeAvailable } from "./rider-mode";

/** True when the active route belongs to rider mode (the rider app, KYC, the commission wallet). */
export function isRiderRouteSegment(first: string | undefined): boolean {
  return first === "rider" || first === "wallet";
}

/**
 * Backstop for the customer-only iPhone app (src/rider-mode.ts): every rider entry point is hidden
 * there, and this sends anything that still reaches a rider route — a stale deep link, an old saved
 * route — back to the customer home. Renders nothing; inert wherever rider mode exists.
 */
export function RiderRouteGate(): null {
  const segments = useSegments();
  const router = useRouter();
  const blocked = !riderModeAvailable() && isRiderRouteSegment(segments[0]);
  useEffect(() => {
    if (blocked) router.replace("/home");
  }, [blocked, router]);
  return null;
}
