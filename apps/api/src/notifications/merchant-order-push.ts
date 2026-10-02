/**
 * Order flow v2 G3a–c (ledger D-59): the push copy for a merchant (restaurant / shop / pharmacy) order's
 * stage changes, from the handoff's `O.g.push` (`packages/design/handoff/order-flow-v2/code/copy.ts`;
 * customer `c`, merchant `m`, rider `r`, each [title, body]). Each template below is the drawn string with
 * its sample values (Gava’s Kitchen, Tendai, Rudo, 12:40–12:55, $16.50, #A1B2 …) turned into `{x}` slots;
 * `merchant-order-push.spec.ts` fills them with the samples and asserts the drawn strings come back
 * byte for byte.
 *
 * Rules (README "Push copy"): name the venue or rider, give the next ETA or the next action, NEVER a
 * delivery or pickup code, never a wallet. The server keeps no arrival estimate for a leg, so a sentence
 * that carries one ("Arrives 12:40–12:55.", "Arrives in ~9 min · 12:47.") is dropped when no value is
 * passed — never invented (the after-send precedent). Notification channels are unchanged: callers keep
 * their own `data` (kind / status / to / orderType).
 */

export type Vars = Record<string, string | number | null | undefined>;

/** One push: the title, then the body as sentences — a sentence with an unfilled `{x}` is dropped. */
interface Template {
  title: string;
  body: readonly string[];
}

/** Customer (G3a), index-aligned with `O.g.push.c`. */
export const PUSH_C = {
  sent: { title: "Order sent to {v}", body: ["They’re confirming now.", "Arrives {a}–{b}."] },
  making: { title: "{v} is {making}", body: ["Arrives {a}–{b}.", "We’ll tell you when a rider has it."] },
  answer: { title: "{v} needs your answer", body: ["{i} is out.", "Swap for {s} ({d})?", "Answer in 3 min."] },
  riderToVenue: { title: "{n} is heading to {v}", body: ["He’ll collect your order soon."] },
  collected: { title: "{n} has your order", body: ["On the way.", "Arrives in ~{m} min · {t}."] },
  atDoor: { title: "{n} is at your door", body: ["Have {p} cash ready."] },
  delivered: { title: "Delivered", body: ["Enjoy!", "Tap to rate {v} and {n}."] },
  notDelivered: { title: "Your order wasn’t delivered", body: ["{n} couldn’t reach you.", "Nothing was charged."] },
  venueCouldnt: { title: "{v} couldn’t take your order", body: ["Nothing was charged.", "Tap to order somewhere else."] },
  noRider: { title: "We couldn’t find a rider", body: ["Nothing was charged.", "Tap to try again."] },
  rxDeclined: { title: "Your prescription wasn’t approved", body: ["Tap to see why.", "The rest of your order carries on."] },
  schedStarted: { title: "Your scheduled order has started", body: ["{v} is {making}.", "Arrives {s}."] },
} as const satisfies Record<string, Template>;

/** Merchant (G3b), index-aligned with `O.g.push.m`. */
export const PUSH_M = {
  newOrder: { title: "New order #{id} · {p}", body: ["{n} {items}.", "Confirm you’re making it."] },
  schedStarts: { title: "Scheduled order #{id} starts now", body: ["{d}’s {t} order.", "Tap to start {making}."] },
  swapAccepted: { title: "{c} accepted the swap", body: ["{s} instead of {i}.", "New total {p}."] },
  noAnswer: { title: "{c} didn’t answer", body: ["{i} taken off.", "Carry on {making}."] },
  atCounter: { title: "{n} is at your counter", body: ["Read him the pickup code."] },
  cashDue: { title: "Delivered · cash back due", body: ["{n} is bringing {p} by {t}."] },
  rxToCheck: { title: "New prescription to check", body: ["#{id} · {i}"] },
} as const satisfies Record<string, Template>;

/** Rider (G3c), index-aligned with `O.g.push.r`. */
export const PUSH_R = {
  foodJob: { title: "New food job · {f}", body: ["{v} → {a}.", "60 s to accept."] },
  shopJob: { title: "New shop job · {f}", body: ["{v} → {a}.", "Photo of the sealed bag at pickup."] },
  ready: { title: "Order is ready", body: ["{v} has your pickup."] },
  cancelled: { title: "{c} cancelled", body: ["Take the food back to {v}."] },
  returnCash: { title: "Return {p} to {v}", body: ["Due by {t}."] },
} as const satisfies Record<string, Template>;

const fill = (s: string, v: Vars): string => s.replace(/\{(\w+)\}/g, (m, k: string) => (v[k] == null || v[k] === "" ? m : String(v[k])));
const unfilled = (s: string): boolean => /\{\w+\}/.test(s);

/**
 * The push for a template: every `{x}` filled from `vars`. A body sentence left with an empty slot is
 * dropped (no ETA ⇒ no "Arrives …"); a title slot falls back to `fallback[x]` (e.g. "Your rider").
 */
export function pushCopy(t: Template, vars: Vars, fallback: Vars = {}): { title: string; body: string } {
  const title = fill(fill(t.title, vars), fallback).replace(/\{\w+\}/g, "").replace(/\s+/g, " ").trim();
  const body = t.body
    .map((s) => fill(s, vars))
    .filter((s) => !unfilled(s))
    .join(" ");
  return { title, body };
}

/** "$16.50" — money as the push copy writes it. */
export function pushMoney(value: unknown): string {
  return `$${(Math.round(Number(value) * 100) / 100).toFixed(2)}`;
}

/** "12:47" in Harare time. */
export function pushTime(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Africa/Harare" }).format(at);
}

/** Cooking vs packing (README "Per service"): shops and pharmacies pack. */
export function makingWord(businessType: string | null | undefined): "cooking" | "packing" {
  return businessType === "shop" ? "packing" : "cooking";
}

/** "Rider" for a food or shop job by the venue: `PUSH_R.shopJob` for shops (photo of the sealed bag). */
export function riderJobTemplate(businessType: string | null | undefined): Template {
  return businessType === "shop" ? PUSH_R.shopJob : PUSH_R.foodJob;
}
