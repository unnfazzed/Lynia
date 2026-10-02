/**
 * The splash's strings — verbatim from `packages/design/handoff/splash-v1/README.md` (ledger D-64).
 * Mock copy is verbatim (CLAUDE.md "Pixel parity"); change them only with a new handoff.
 */
export const S = {
  brand: "LyniaGo",
  steps: ["Checking it's you", "Loading your saved places", "Finding riders near you"] as const,
  slow: "Slow network — still connecting",
  offlineTitle: "You're offline",
  offlineBody: "We'll keep trying. Check your mobile data or Wi-Fi.",
  retry: "Try again",
} as const;
