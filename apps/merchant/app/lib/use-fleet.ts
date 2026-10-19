"use client";

import { useCallback, useEffect, useState } from "react";
import type { OwnerFleetResponse } from "@lynia/shared";
import { ApiError } from "./api-client";
import { getFleet } from "./fleet-api";

/**
 * The business's Own bikers (D-117) for the screens that change with it: Book (My bikers | Any biker) and the
 * kitchen's Orders (the Book card). `undefined` while reading; `null` = no Own bikers here (none switched on, or
 * the feature isn't live yet: the API answers 503); `"unreachable"` = the read didn't reach LyniaGo.
 */
export type FleetRead = OwnerFleetResponse | null | undefined | "unreachable";

const KNOWN_KEY = "lynia.merchant.fleet";

/** Whether this tab last saw the business with Own bikers: Book draws its toggle (loading) before the read lands. */
export function likelyFleet(): boolean {
  try {
    return window.sessionStorage.getItem(KNOWN_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(on: boolean): void {
  try {
    window.sessionStorage.setItem(KNOWN_KEY, on ? "1" : "0");
  } catch {
    // Private mode or storage off: Book just doesn't pre-draw the toggle.
  }
}

export function useFleet(enabled = true): { fleet: FleetRead; reload: () => void } {
  const [fleet, setFleet] = useState<FleetRead>(undefined);
  const read = useCallback(() => {
    setFleet(undefined);
    getFleet().then(
      (f) => {
        remember(f.enabled);
        setFleet(f.enabled ? f : null);
      },
      (err: unknown) => {
        const unreachable = err instanceof ApiError && err.status === 0;
        if (!unreachable) remember(false);
        setFleet(unreachable ? "unreachable" : null);
      },
    );
  }, []);
  useEffect(() => {
    if (enabled) read();
  }, [enabled, read]);
  return { fleet, reload: read };
}

/** Bikers free to take a job now ("My bikers · 2 online"): online, not already on one. */
export function bikersOnline(fleet: OwnerFleetResponse): number {
  return fleet.bikers.filter((b) => b.state === "online").length;
}
