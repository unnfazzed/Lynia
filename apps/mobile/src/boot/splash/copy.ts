/**
 * The splash's strings — verbatim from `packages/design/handoff/splash-v1/README.md` and
 * `CHANGE-2026-10-06.md` (ledger D-64). Mock copy is verbatim (CLAUDE.md "Pixel parity"); change them
 * only with a new handoff. The step labels went with the steps card (2026-10-06).
 */
export const S = {
  brand: "LyniaGo",
  /** Announced once when the `loading` phase starts (the steps card's live region is gone). */
  loading: "Loading LyniaGo",
  slow: "Slow network — still connecting",
  offlineTitle: "You're offline",
  offlineBody: "We'll keep trying. Check your mobile data or Wi-Fi.",
  retry: "Try again",
} as const;
