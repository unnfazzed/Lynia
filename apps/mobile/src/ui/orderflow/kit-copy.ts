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
  /** of-screens-rt.js T11a — the ready line. */
  readyAt: "{ready} · {t}",
  /** of-screens-upd.js U2a / U4a — the bar hint while a swap is unanswered. */
  answerHint: "Answer the swap to confirm",
  /** of-screens-upd.js U3 — the note under the track after a timeout. */
  changes: "Changes: {i} taken off · {d}",
  /** of-screens-mrg.js P5 / M5b — the door-photo sub ("Left with Chipo at the gate · 12:47") and hero. */
  leftWith: "Left with {w}",
  leftWithAtGate: "Left with {w} at the gate",
  leftAtGate: "Left at the gate",
  doorSub: "{where} · {t}",
  doorAgreed: "{where} — you agreed with {n}.",
  /** of-screens-upd.js D3f — the ending card's amount. */
  owed: "{p} owed",
  /** of-screens-upd.js D4 — the photo of the delivery attempt. */
  attemptPhoto: "Delivery attempt photo",
  attemptSub: "At {a} · {t}",
} as const;

/**
 * Where the rider left the order when the code couldn't be used (P5): "Left with Chipo at the gate",
 * "Left with Chipo", "Left at the gate"; null when the reason doesn't say (customer unreachable).
 */
export function doorWhere(p: { reason: string | null; handedTo: string | null }): string | null {
  const who = p.handedTo?.trim() || null;
  if (p.reason === "left_at_gate") return who ? ofFmt(OX.leftWithAtGate, { w: who }) : OX.leftAtGate;
  if (p.reason === "handed_to_someone_else" && who) return ofFmt(OX.leftWith, { w: who });
  return null;
}

/**
 * The handoff's sample rider is "Tendai" and its sample customer "Rudo"; `O` bakes those names into a
 * few strings ("Tendai hands it over first"). The app puts the real first name in their place.
 */
export function withRider(s: string, riderFirst: string): string {
  return s.replace(/Tendai/g, riderFirst);
}

/** The service vocabulary for a merchant order. Restaurants are the only merchant orders today. */
export const SVC = O.svc.food;
