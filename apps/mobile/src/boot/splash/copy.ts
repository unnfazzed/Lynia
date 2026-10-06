import { SP } from "../../ui/firstrun/copy";

/**
 * The splash's strings — verbatim from `packages/design/handoff/splash-v1/README.md` (ledger D-64).
 * Mock copy is verbatim (CLAUDE.md "Pixel parity"); change them only with a new handoff.
 *
 * The rider's two steps and the rider offline row are First Run v2's (`SP`, ledger D-80 §2 #2: splash-v1's
 * look, the handoff's rider steps and offline row).
 */
export const RIDER_STEPS = [SP.r1, SP.r2] as const;
export const RIDER_OFFLINE = { title: SP.offline, body: SP.offlineBody } as const;

export const S = {
  brand: "LyniaGo",
  steps: ["Checking it's you", "Loading your saved places", "Finding riders near you"] as const,
  slow: "Slow network — still connecting",
  offlineTitle: "You're offline",
  offlineBody: "We'll keep trying. Check your mobile data or Wi-Fi.",
  retry: "Try again",
} as const;
