"use client";

import { RetryableError } from "./RetryableError";

/**
 * A screen that threw while rendering. No handoff draws a crash page, so it takes T14b's failure look
 * (`RetryableError`, D-O1 / D-74) and only its title is new copy (ledger: DESIGN-DEVIATIONS "Merchant
 * crash page"). One component so the three boundaries (app/error.tsx, app/(app)/error.tsx,
 * app/global-error.tsx) can never drift apart.
 */
export const CRASH_TITLE = "Couldn't open this screen";

export function CrashState({ onRetry }: { onRetry: () => void }) {
  return <RetryableError message={CRASH_TITLE} onRetry={onRetry} />;
}

/** The first path segment of each tab-shell route, mapped to the screen id `Kitchen` keys its tab on. */
const SCREEN_FOR_SEGMENT: Record<string, string> = {
  queue: "queue",
  deliveries: "deliveries",
  menu: "catalog",
  statement: "money",
  account: "account",
  shop: "account",
  hours: "account",
  ordering: "account",
  riders: "account",
  team: "account",
  branches: "account",
};

/** The screen id for a path, so a crashed screen's tab stays lit (Kitchen falls back to Orders). */
export function screenForPath(pathname: string | null): string {
  const segment = (pathname ?? "").split("/").filter(Boolean)[0] ?? "";
  return SCREEN_FOR_SEGMENT[segment] ?? "queue";
}
