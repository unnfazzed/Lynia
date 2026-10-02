"use client";

import { useEffect, useState } from "react";
import { getOrderFlags } from "./orders-api";

/**
 * Order flow v2's `rxEnabled` (BRIEF §13, ledger D-59): prescriptions are behind a server flag, off by
 * default. Every Rx control (the dish's "Prescription needed", the team's pharmacist switch) renders only
 * once the server says it is on — fail-safe off, so a failed read hides them. Read once per page load.
 */
let cached: Promise<boolean> | null = null;

function rxEnabled(): Promise<boolean> {
  cached ??= getOrderFlags()
    .then((f) => f.rxEnabled === true)
    .catch(() => {
      cached = null;
      return false;
    });
  return cached;
}

export function useRxEnabled(enabled = true): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void rxEnabled().then((v) => {
      if (alive) setOn(v);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return on;
}
