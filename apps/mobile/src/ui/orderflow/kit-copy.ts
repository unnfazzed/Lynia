import type { MerchantService } from "../../logic/merchant-order";
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
  /** T1's `O.t.waitingSub` without its first sentence, once the drawn 3:00 has run out: since owner
   *  decision D1 (2026-10-07) the venue may still answer for 24 h, so "They have 3 minutes." would be
   *  untrue. The words are the handoff's own second sentence. Ledger D-87. */
  waitingLapsedSub: "Nothing is ordered until they accept.",
  /** D3c's `O.d.cxKitchenSub` without "We waited an hour." — since D1 the kitchen-unconfirmed cancel comes
   *  at 24 h, so that sentence is untrue. The handoff's own second sentence. Ledger D-87. */
  cxKitchenSub: "Nothing was charged.",
  /** U33 (C8): the LyniaGo ending (D3, `O.d.cxLynia`) for N-18 — the customer didn't answer the item
   *  approval in time — whose drawn sub ("The {place} reported a problem…") would be untrue. `O.u.timeout`'s
   *  "No answer in time." and `O.d.cxYouSub`, verbatim; the same sentence as its push
   *  (`MERCHANT_REJECTION_REASONS.item_approval_expired`). Ledger D-94. */
  cxNoAnswerSub: "No answer in time. Nothing was charged.",
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

/** One service's vocabulary (`O.svc.food` / `.shops` / `.pharmacy`): Cooking vs Packing, dishes vs items. */
export type SvcCopy = (typeof O.svc)[MerchantService];
export function svcCopy(s: MerchantService): SvcCopy {
  return O.svc[s];
}

/** The four track labels; pharmacy step 1 reads "Prescription checked" once an Rx was approved (BRIEF §4). */
export function trackLabels(s: MerchantService, rxChecked: boolean): readonly string[] {
  if (s === "pharmacy" && rxChecked) return [O.svc.pharmacy.stRx, ...O.svc.pharmacy.st.slice(1)];
  return O.svc[s].st;
}

/** Markup strings for the shop / pharmacy / Rx states (of-screens-rt.js T5b, of-screens-upd.js D5b). */
export const OXS = {
  /** T5b — the pharmacy's seal note under the prep bar. */
  sealNote: "The pharmacy seals the bag. Check the seal before you pay.",
  /** D5b — the ending's button. */
  otherPharmacies: "See other pharmacies",
  /** D5a — "Expired · dated March 2026": the pharmacist's reason chip, then their note. */
  rxReason: "{r} · {n}",
} as const;

/** The pharmacist's decline reason in the chip's words (`O.m.rxR`, index-aligned with the API enum). */
export function rxReasonLabel(reason: string | null | undefined, note: string | null | undefined): string {
  const i = ["unreadable", "expired", "not_valid", "other"].indexOf(reason ?? "other");
  const r = O.m.rxR[i < 0 ? 3 : i] ?? O.m.rxR[3];
  const n = note?.trim();
  return n ? ofFmt(OXS.rxReason, { r, n }) : r;
}

/**
 * Customer briefs 07 + 09 (ledger D-97, `packages/design/handoff/customer-briefs-06-09/copy.ts`): the new
 * strings for D3g (the venue's own note) and R8c–R8e (remove / view a prescription page) — verbatim, with
 * the handoff's key names.
 */
export const OB = {
  // 07 · D3g
  venueNoteLabel: "Note from {venue}",
  rejectedSubWithNote: "Nothing was charged.",
  // 09 · R8c / R8d / R8e
  removePageA11y: "Remove page {n}",
  openPageA11y: "Page {n}, open",
  pageOf: "Page {n} of {total}",
  pageRemoved: "Page removed",
  undo: "Undo",
  remove: "Remove",
  retake: "Retake",
  close: "Close",
} as const;
