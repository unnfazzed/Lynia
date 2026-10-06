import { SP } from "../../ui/firstrun/copy";

/**
 * The splash's strings — verbatim from `packages/design/handoff/splash-v1/README.md` and
 * `CHANGE-2026-10-06.md` (ledger D-64). Mock copy is verbatim (CLAUDE.md "Pixel parity"); change them
 * only with a new handoff. The customer's step labels went with the steps card (2026-10-06).
 *
 * The rider's two steps and its offline row are First Run v2's (`SP`, ledger D-82 §2 #2). The rider
 * splash keeps its card: CHANGE-2026-10-06 leaves it alone ("Don't change Home or the rider splash").
 */
export const RIDER_STEPS = [SP.r1, SP.r2] as const;
export const RIDER_OFFLINE = { title: SP.offline, body: SP.offlineBody } as const;

export const S = {
  brand: "LyniaGo",
  /** Announced once when the `loading` phase starts (the steps card's live region is gone). */
  loading: "Loading LyniaGo",
  slow: "Slow network — still connecting",
  offlineTitle: "You're offline",
  offlineBody: "We'll keep trying. Check your mobile data or Wi-Fi.",
  retry: "Try again",
} as const;
