import { ofFmt, O } from "./copy";

/**
 * Strings the Order flow v2 handoff draws in its MARKUP rather than in `O` (`of-kit.js`, `of-polish.js`,
 * `of-screens-*.js`) — lifted verbatim, with the sample people / times turned into `{x}` placeholders
 * (CLAUDE-CODE-PROMPT.md: "If a string is missing, add it … in the same style and list it in your PR").
 * `copy.ts` itself stays the handoff's `O`, byte for byte. Ledger D-59.
 */
export const OX = {
  /** of-polish.js `K.top` — the ETA hero labels. */
  etaRangeLabel: "Estimated arrival",
  etaOneLabel: "Arriving in",
  arrivesAt: "Arrives {t}",
  /** of-polish.js `K.prep` — the right side of the prep bar. */
  prepLeft: "about {m} min left",
  /** of-kit.js `codeCard` / `codeBig`. */
  deliveryCode: "Delivery code",
  /** of-kit.js `codeBig` (v2; the v2.1 line carries a pronoun the app can't know). */
  codeBigSub: "{s3} — {n} types it in to finish.",
  /** of-screens-upd.js `door` — the done sub of door row 2. */
  bothConfirmed: "Both confirmed {t}",
  /** of-screens-upd.js `totals`. */
  was: "Was",
  /** of-screens-upd.js `ending` — the order card. */
  noCharge: "No charge",
  orderAt: "{order} · {t}",
  /** of-screens-upd.js D1 / D4 — the help link and button. */
  helpWithOrder: "Get help with this order",
  /** of-screens-rt.js T11b — the searching line and the toast. */
  asking: "Asking riders near {v}…",
  droppedToast: "{n} had to cancel. Finding another rider — same price.",
  /** of-screens-rt.js T7 sub. */
  atVenue: "{n} is at {v}.",
  /** of-screens-rt.js T14d sub. */
  lastUpdate: "Last update {t}",
  /** of-screens-rt.js T11a — the ready line. */
  readyAt: "{ready} · {t}",
} as const;

/** `ofFmt` for the kit strings. */
export const oxFmt = ofFmt;

/**
 * The handoff's sample rider is "Tendai" and its sample customer "Rudo"; `O` bakes those names into a
 * few strings ("Tendai hands it over first"). The app puts the real first name in their place.
 */
export function withRider(s: string, riderFirst: string): string {
  return s.replace(/Tendai/g, riderFirst);
}

/** The service vocabulary for a merchant order. Restaurants are the only merchant orders today. */
export const SVC = O.svc.food;
