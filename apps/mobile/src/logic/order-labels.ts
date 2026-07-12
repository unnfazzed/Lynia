// Pure label/timer helpers for the customer order screen — no React, unit-testable in isolation.

// A rider's `undelivered` reason code → the verbatim line shown on the customer's terminal card. The
// stored code is authoritative; this only makes it readable (mirrors new-flows.html "recipient
// unreachable · N attempts").
export const UNDELIVERED_REASON_LABEL: Record<string, string> = {
  unreachable: "recipient unreachable",
  refused: "recipient refused delivery",
  wrong_address: "address was wrong",
  breakdown: "rider breakdown",
};

export type SortMode = "best" | "cheapest" | "fastest" | "rated";
export const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: "best", label: "Best match" },
  { key: "cheapest", label: "Cheapest" },
  { key: "fastest", label: "Fastest" },
  { key: "rated", label: "Top rated" },
];

/** mm:ss for the auction timer. */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Spoken form for the timer's accessibilityLabel, e.g. "1 minute 20 seconds left". */
export function spokenRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return `Offer window: ${parts.join(" ")} left`;
}

/**
 * C4 + JOURNEY-BUGS: a rider fix only counts as "live" while it's fresh (past `escalationMs` since the
 * last one, escalate to "call your rider"). But if NO fix ever arrives at all — the rider denied
 * location permission, or their GPS stream never connected — `riderUpdatedAt` stays null forever and a
 * check keyed only on it never escalates; the customer is stuck reading "Waiting for the rider's
 * GPS…" for the rest of the trip. Anchor a second "never fixed" timeout off the assignment event.
 */
export function isRiderTrackingStale(args: {
  isActive: boolean;
  riderUpdatedAt: string | null;
  assignedAt: string | null;
  nowMs: number;
  escalationMs: number;
}): boolean {
  if (!args.isActive) return false;
  if (args.riderUpdatedAt != null) return args.nowMs - new Date(args.riderUpdatedAt).getTime() > args.escalationMs;
  return args.assignedAt != null && args.nowMs - new Date(args.assignedAt).getTime() > args.escalationMs;
}

/**
 * JOURNEY-BUGS: the auction header used to just read "Finding riders near you…" straight through to
 * 0:00, then keep reading it for up to the 15s poll interval before the status transition caught up —
 * a dead-looking stall right when the customer is watching the clock closest. A transitional line at
 * the threshold covers that gap instead of a silent stare.
 */
export function auctionHeaderText(args: { remainingMs: number | null; bidCount: number; noRiders: boolean; reconnecting: boolean }): string {
  const suffix = args.reconnecting ? " · reconnecting…" : "";
  if (args.remainingMs === 0) return "Window closing — wrapping up…";
  if (args.bidCount > 0) return `${args.bidCount} ${args.bidCount === 1 ? "rider" : "riders"} bidding${suffix}`;
  if (args.noRiders) return `No riders online nearby right now${suffix}`;
  return `Finding riders near you…${args.reconnecting ? " reconnecting…" : ""}`;
}
