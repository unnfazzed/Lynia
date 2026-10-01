// Calm Mint v2 R3 (packages/design/handoff/calm-mint-v2-2026-10, ledger D-55): a rider who has just
// been verified and has no trips yet opens the board — "You're verified, Tendai" takes its place once.
// Evidence-only (tools/parity/shoot-calm-mint.mjs).
import { stage, wrapAuth } from "./_rider_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1200;
stage({ kycStatus: "verified", tripsCount: 0, balance: 0 });

export default { wrap: wrapAuth };
