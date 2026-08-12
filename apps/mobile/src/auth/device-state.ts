import * as SecureStore from "expo-secure-store";
// Import the on-device store keys from their owning modules so the sign-out wipe below can't drift from
// the keys those modules actually write (type-only-adjacent leaf modules — no runtime import cycle).
import { HISTORY_SNAPSHOT_KEY } from "../net/history-store";
import { RECENTS_KEY as SAVED_PLACES_RECENTS_KEY, SAVED_KEY as SAVED_PLACES_SAVED_KEY } from "../logic/saved-places";
import { MY_PICKUP_PHONE_KEY, RECIPIENTS_KEY } from "../logic/saved-recipients";
import { KYC_DRAFT_KEY } from "../logic/kyc-draft";
import { PROFILE_DRAFT_KEY } from "../logic/profile-draft";
import { RIDER_IDENTITY_KEY } from "../logic/rider-identity";
import { JOB_KEY, ORDER_HINT_KEY } from "../net/last-active-store";
import { RIDER_BID_DRAFT_KEY, RIDER_SENT_OFFERS_KEY } from "../logic/rider-bid-draft";
import { PICKUP_CHECKLIST_DRAFT_KEY } from "../logic/pickup-checklist-draft";
import { PICKUP_PHOTO_DRAFT_KEY } from "../logic/pickup-photo-draft";
import { RESTAURANT_LIST_SNAPSHOT_KEY } from "../net/restaurant-list-store";
import { FOOD_CART_SNAPSHOT_KEY } from "../net/food-cart-store";
import { FOOD_ORDER_SNAPSHOT_KEY } from "../net/food-order-store";
import type { UndeliveredReason } from "@lynia/shared";

// The one-time delivery handover code is returned once by `select`; persist it per-order so it
// survives a remount/relaunch (the server keeps only the hash and can't re-send it).
const codeKey = (orderId: string): string => `lynia.deliveryCode.${orderId}`;

// Companion to codeKey: the highest `deliveryOtpAttempts` value seen while THIS stored code was current.
// A code rotation (customer re-issue) resets the server's counter to 0, so a later snapshot whose attempts
// count has dropped below this high-water mark reveals the local code is stale — even if the rotate response
// never landed (app killed mid-rotation). Kept beside the code and cleared with it. See
// reconcileDeliveryCode in logic/order-tracking.ts.
const codeAttemptsKey = (orderId: string): string => `lynia.deliveryCodeAttempts.${orderId}`;

// Companion to codeKey: the delivery-code rotation timestamp (`OrderSnapshot.codeRotatedAt`) last CONFIRMED
// to correspond to THIS stored code. The server stamps a fresh value on every issue/rotate, so a later
// snapshot whose timestamp differs from this baseline proves the code was re-issued — the PRIMARY rotation
// signal, reliable even when the app was killed before the rotate response landed (unlike the attempts
// high-water heuristic, which needs the client to have observed the elevated count first). Kept beside the
// code and cleared with it. See reconcileDeliveryCode in logic/order-tracking.ts.
const codeRotatedAtKey = (orderId: string): string => `lynia.deliveryCodeRotatedAt.${orderId}`;

// SecureStore can't enumerate keys, so we keep a tiny index of order ids that have a stored code.
// That lets sign-out delete every per-order code on a shared device (S1). Best-effort like the rest.
const CODE_INDEX_KEY = "lynia.deliveryCode.index";

async function readCodeIndex(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(CODE_INDEX_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function saveDeliveryCode(orderId: string, code: string): Promise<void> {
  await SecureStore.setItemAsync(codeKey(orderId), code);
  // A freshly issued/rotated code always corresponds to a server attempt counter reset to 0 (both `select`
  // and `rotateDeliveryCode` set deliveryOtpAttempts = 0), so seed the high-water mark to 0 — otherwise a
  // stale companion from a previous code would make the next snapshot look like a rotation-drop.
  try {
    await SecureStore.setItemAsync(codeAttemptsKey(orderId), "0");
  } catch {
    /* best-effort */
  }
  // Clear any stale rotation-timestamp baseline: a freshly issued/rotated code corresponds to a NEW
  // server `codeRotatedAt` we can't read synchronously here (select/rotate return only the plaintext). So
  // reset to "unknown" and let reconcileDeliveryCode re-baseline (sync-rotation-ts) off the first snapshot
  // that carries the new stamp — otherwise a leftover baseline would make that new stamp look like a
  // rotation-away from our own just-issued code and wrongly invalidate it.
  try {
    await SecureStore.deleteItemAsync(codeRotatedAtKey(orderId));
  } catch {
    /* best-effort */
  }
  // Record the order id so sign-out can clear it later — best-effort, never block the code save.
  try {
    const idx = await readCodeIndex();
    if (!idx.includes(orderId)) await SecureStore.setItemAsync(CODE_INDEX_KEY, JSON.stringify([...idx, orderId]));
  } catch {
    /* best-effort */
  }
}
/** The stored hand-off code, or null when none is held OR the keychain read fails. Catching (rather
 *  than rejecting) matches every sibling loader below, and matters to the callers' restore effects:
 *  they `Promise.all` this with those siblings and flip a "restore settled" flag in `.then`, so an
 *  unguarded rejection would strand that flag false and leave the code card — including its re-issue
 *  escape hatch — permanently unrendered. Null degrades to "no code held", which is recoverable. */
export async function loadDeliveryCode(orderId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(codeKey(orderId));
  } catch {
    return null;
  }
}

/** Persist the high-water mark of server-side delivery-code attempts seen while the stored code is current
 *  (see reconcileDeliveryCode). Best-effort — a native write failure just means we can't detect a rotation
 *  that happens while the app is killed, which degrades to today's behaviour rather than breaking anything. */
export async function saveDeliveryCodeAttempts(orderId: string, attempts: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(codeAttemptsKey(orderId), String(attempts));
  } catch {
    /* best-effort */
  }
}
export async function loadDeliveryCodeAttempts(orderId: string): Promise<number | null> {
  try {
    const raw = await SecureStore.getItemAsync(codeAttemptsKey(orderId));
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Persist the delivery-code rotation timestamp last CONFIRMED to match the stored code (see
 *  reconcileDeliveryCode). Best-effort — a native write failure just degrades to the attempts heuristic. */
export async function saveDeliveryCodeRotatedAt(orderId: string, codeRotatedAt: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(codeRotatedAtKey(orderId), codeRotatedAt);
  } catch {
    /* best-effort */
  }
}
export async function loadDeliveryCodeRotatedAt(orderId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(codeRotatedAtKey(orderId));
  } catch {
    return null;
  }
}

/** Clear a stale local delivery code (and its attempts high-water + rotation-timestamp baseline) — used
 *  when a rotation is detected so the "code isn't showing — re-issue" path takes over instead of the
 *  customer relaying a dead code. */
export async function clearDeliveryCode(orderId: string): Promise<void> {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(codeKey(orderId)),
      SecureStore.deleteItemAsync(codeAttemptsKey(orderId)),
      SecureStore.deleteItemAsync(codeRotatedAtKey(orderId)),
      SecureStore.deleteItemAsync(codeRevealedKey(orderId)),
    ]);
  } catch {
    /* best-effort */
  }
}

// D4/R-09: a food CASH order's delivery code stays masked in the UI until a deliberate press-and-hold
// — "a deliberate act, logged and synced later." No sync endpoint exists yet (flagged in the D4 PR
// body); this is the durable local half, keyed alongside the code itself so it rides the same
// per-order index and sign-out sweep below.
const codeRevealedKey = (orderId: string): string => `lynia.deliveryCodeRevealed.${orderId}`;

export async function saveCodeRevealedAt(orderId: string, at: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(codeRevealedKey(orderId), at);
  } catch {
    /* best-effort */
  }
}

// A durable "confirmItems still needs to reach the server for order X" marker (KB-CONFIRMITEMS-RETRY). The
// rider's pickup-item confirmation is fired as the rider advances to `picked_up`; if that POST's response
// is lost (or the app is killed) right then, the order is left permanently missing its confirmed-items
// record with nothing to retry it. We persist the pending confirmation here BEFORE firing and clear it on
// confirmed success, so a foreground/reconnect/cold-start can re-send it while the order is still at
// `en_route_pickup` (the only status the server accepts it at). Single slot — a rider has one active job.
const CONFIRM_ITEMS_PENDING_KEY = "lynia.confirmItemsPending";
export interface ConfirmItemsPending {
  orderId: string;
  confirmedIndexes: number[];
}

export async function saveConfirmItemsPending(orderId: string, confirmedIndexes: number[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(CONFIRM_ITEMS_PENDING_KEY, JSON.stringify({ orderId, confirmedIndexes }));
  } catch {
    /* best-effort */
  }
}
export async function loadConfirmItemsPending(): Promise<ConfirmItemsPending | null> {
  try {
    const raw = await SecureStore.getItemAsync(CONFIRM_ITEMS_PENDING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && typeof (v as { orderId?: unknown }).orderId === "string" && Array.isArray((v as { confirmedIndexes?: unknown }).confirmedIndexes)) {
      const indexes = (v as { confirmedIndexes: unknown[] }).confirmedIndexes.filter((n): n is number => typeof n === "number");
      return { orderId: (v as { orderId: string }).orderId, confirmedIndexes: indexes };
    }
    return null;
  } catch {
    return null;
  }
}
export async function clearConfirmItemsPending(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(CONFIRM_ITEMS_PENDING_KEY);
  } catch {
    /* best-effort */
  }
}

// BH-06: a durable "rating still needs to reach the server for order X" marker, mirroring
// CONFIRM_ITEMS_PENDING_KEY above. RatingCard's rating-on-tap arms a rating behind a short undo window
// and only flushes it on a React unmount (leaving the screen) — an OS-level app kill within that window
// destroys the timer/closure with no unmount effect, silently dropping a rating the customer believes
// they already submitted (they saw "Submitting N★…"). Persist the armed score BEFORE the undo window
// starts and clear it on Undo or on confirmed success, so a cold start can re-send it. Single slot — a
// customer has one order awaiting rating at a time.
const PENDING_RATING_KEY = "lynia.pendingRating";
export interface PendingRating {
  orderId: string;
  score: number;
}

export async function savePendingRating(orderId: string, score: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_RATING_KEY, JSON.stringify({ orderId, score }));
  } catch {
    /* best-effort */
  }
}
export async function loadPendingRating(): Promise<PendingRating | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_RATING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && typeof (v as { orderId?: unknown }).orderId === "string" && typeof (v as { score?: unknown }).score === "number") {
      return { orderId: (v as { orderId: string }).orderId, score: (v as { score: number }).score };
    }
    return null;
  } catch {
    return null;
  }
}
export async function clearPendingRating(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_RATING_KEY);
  } catch {
    /* best-effort */
  }
}

// A durable "rider job terminal still needs acknowledging" marker for the DELIVERED and UNDELIVERED
// frozen terminals in rider/job.tsx. Both terminals are frozen in-memory only — the order has already
// left activeForRider (delivered/undelivered aren't in ACTIVE_RIDE_STATUSES), so there is nothing left
// to refetch. An app kill between the mutation's success and the rider tapping "Back to board"
// previously lost the acknowledgement outright (and, for a delivered order, the "rate the sender"
// affordance) — mirroring the gap BH-06 already closed for the customer's rating card. Persist the
// terminal BEFORE freezing it in component state; clear it once the rider taps "Back to board" or on
// sign-out. Single slot — a rider has one active job at a time.
const RIDER_JOB_TERMINAL_KEY = "lynia.riderJobTerminal";
export type RiderJobTerminal = { orderId: string; kind: "delivered" } | { orderId: string; kind: "undelivered"; reason: UndeliveredReason };

export async function saveRiderJobTerminal(terminal: RiderJobTerminal): Promise<void> {
  try {
    await SecureStore.setItemAsync(RIDER_JOB_TERMINAL_KEY, JSON.stringify(terminal));
  } catch {
    /* best-effort */
  }
}
export async function loadRiderJobTerminal(): Promise<RiderJobTerminal | null> {
  try {
    const raw = await SecureStore.getItemAsync(RIDER_JOB_TERMINAL_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && typeof (v as { orderId?: unknown }).orderId === "string" && typeof (v as { kind?: unknown }).kind === "string") {
      const orderId = (v as { orderId: string }).orderId;
      const kind = (v as { kind: string }).kind;
      if (kind === "delivered") return { orderId, kind: "delivered" };
      if (kind === "undelivered" && typeof (v as { reason?: unknown }).reason === "string") {
        return { orderId, kind: "undelivered", reason: (v as { reason: UndeliveredReason }).reason };
      }
    }
    return null;
  } catch {
    return null;
  }
}
export async function clearRiderJobTerminal(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(RIDER_JOB_TERMINAL_KEY);
  } catch {
    /* best-effort */
  }
}

// BH-07: a durable "rate-the-sender still needs to reach the server for order X" marker, mirroring
// PENDING_RATING_KEY above for the rider's own optional post-delivery star tap. Unlike the customer's
// rateOrder (which flips the order to `status: "completed"` — an unambiguous "already rated" signal),
// rateSender is recorded-only and never changes order status, so there's no snapshot field to reconcile
// against; the retry below instead treats the server's own "Order already rated" 409 as confirmation.
// Persisted the instant the star is tapped (before the POST resolves) so a full app-kill — not just a
// lost response — is retried on the next launch. Single slot — a rider has one delivered job awaiting
// this at a time.
const PENDING_SENDER_RATING_KEY = "lynia.pendingSenderRating";
export interface PendingSenderRating {
  orderId: string;
  score: number;
}

export async function saveSenderRatingPending(orderId: string, score: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_SENDER_RATING_KEY, JSON.stringify({ orderId, score }));
  } catch {
    /* best-effort */
  }
}
export async function loadSenderRatingPending(): Promise<PendingSenderRating | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_SENDER_RATING_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && typeof (v as { orderId?: unknown }).orderId === "string" && typeof (v as { score?: unknown }).score === "number") {
      return { orderId: (v as { orderId: string }).orderId, score: (v as { score: number }).score };
    }
    return null;
  } catch {
    return null;
  }
}
export async function clearSenderRatingPending(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_SENDER_RATING_KEY);
  } catch {
    /* best-effort */
  }
}

// UX-2026-07-16: a durable "top-up still needs resolving" marker, mirroring PENDING_SENDER_RATING_KEY
// above. The top-up "wait" step sends the rider OUT to another app (SMS/USSD/mobile-money) to approve
// the rail prompt — the exact moment the OS is most likely to reclaim/kill a backgrounded process on a
// low-end device — and `topup`/`step` in top-up.tsx are plain component state, never persisted. An app
// kill mid-wait previously lost all UI state with no way to tell whether the top-up landed short of
// manually watching the balance. Read + cleared by the Money tab, which reconciles the marker to a
// terminal outcome. Single slot — a rider has one top-up attempt in flight at a time.
//
// NO WRITER TODAY. The `savePendingTopup` half was removed as dead code: it never had a caller in any
// commit, because the self-serve rail it belonged to was never integrated (`WalletService
// .creditFromTopup` has no callers either, and `app/wallet/top-up.tsx` was rewritten to a "call
// support" screen). Still true after 2026-08-12: the kit's top-up screens now ship to riders as a
// labelled PREVIEW (`src/ui/rider/TopUpSimulator.tsx`), but it makes no network call and opens no
// `TopUp` intent, so it deliberately writes no marker here — there is nothing to reconcile when
// nothing was ever requested. The read/clear half is kept deliberately: it is the landing point for
// the rail integration, and it costs nothing until then. See `docs/PAYMENT-RAIL-OUTSTANDING.md`.
const PENDING_TOPUP_KEY = "lynia.pendingTopup";
export interface PendingTopup {
  topupId: string;
}

export async function loadPendingTopup(): Promise<PendingTopup | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_TOPUP_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (v && typeof v === "object" && typeof (v as { topupId?: unknown }).topupId === "string") {
      return { topupId: (v as { topupId: string }).topupId };
    }
    return null;
  } catch {
    return null;
  }
}
export async function clearPendingTopup(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_TOPUP_KEY);
  } catch {
    /* best-effort */
  }
}

// Which starting role the user picked at the post-OTP role fork (one account, two roles). Persisted
// so an existing user isn't re-prompted on every sign-in — verify.tsx routes straight home once set.
// All best-effort: a native read/write failure must never trap the sign-in flow.
export type StartRole = "customer" | "rider";
const ROLE_PREF_KEY = "lynia.rolePreference";

export async function saveRolePreference(role: StartRole): Promise<void> {
  try {
    await SecureStore.setItemAsync(ROLE_PREF_KEY, role);
  } catch {
    /* best-effort */
  }
}
export async function loadRolePreference(): Promise<StartRole | null> {
  try {
    const v = await SecureStore.getItemAsync(ROLE_PREF_KEY);
    return v === "customer" || v === "rider" ? v : null;
  } catch {
    return null;
  }
}

// Whether the first-install onboarding carousel (customer/rider 0·2) has been shown on this device.
// Persisted so the intro appears exactly once per install, before auth. Best-effort — a read failure
// just re-shows the carousel once (harmless) and a write failure never traps the hand-off to /phone.
const ONBOARDING_KEY = "lynia.onboardingSeen";

export async function saveOnboardingSeen(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ONBOARDING_KEY, "1");
  } catch {
    /* best-effort */
  }
}
export async function loadOnboardingSeen(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ONBOARDING_KEY)) === "1";
  } catch {
    return false;
  }
}

// Whether we've shown the first-run permission-priming explainers (0·7/0·8) on this install. Stored
// so a user who's already been primed (and switches role later) isn't re-walked through them. Best-
// effort — a read failure just re-primes, which is harmless.
const PERMISSIONS_PRIMED_KEY = "lynia.permissionsPrimed";

export async function savePermissionsPrimed(): Promise<void> {
  try {
    await SecureStore.setItemAsync(PERMISSIONS_PRIMED_KEY, "1");
  } catch {
    /* best-effort */
  }
}
export async function loadPermissionsPrimed(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(PERMISSIONS_PRIMED_KEY)) === "1";
  } catch {
    return false;
  }
}

// Latest liability-disclaimer policy version the customer has accepted on this device (A1-8). Stored
// so the accept-to-continue gate isn't re-shown every broadcast. Best-effort — a read failure just
// re-shows the gate, which is safe.
const DISCLAIMER_KEY = "lynia.disclaimerAccepted";

export async function saveDisclaimerAccepted(policyVersion: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(DISCLAIMER_KEY, policyVersion);
  } catch {
    /* best-effort */
  }
}
export async function loadDisclaimerAccepted(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(DISCLAIMER_KEY);
  } catch {
    return null;
  }
}

// Orders the rider has already handed back (acknowledged the hand-back terminal for) on this device
// (R8 follow-up). A cancelled order stays reopenable for 24h, so its snapshot keeps surfacing on the
// board as a "hand this parcel back" prompt; once the rider taps "Back to board" we record the id here
// so the already-returned parcel doesn't nag them again. Bounded to the most recent ids to keep the
// blob tiny. Best-effort — a read failure just re-shows the prompt (safe), a write never traps the tap.
const HANDBACK_ACK_KEY = "lynia.handbackAck";
const HANDBACK_ACK_MAX = 20;

async function readHandbackAcks(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(HANDBACK_ACK_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function acknowledgeHandback(orderId: string): Promise<void> {
  try {
    const acks = await readHandbackAcks();
    if (acks.includes(orderId)) return;
    // Keep the newest ids, drop the oldest so the list can't grow without bound.
    const next = [...acks, orderId].slice(-HANDBACK_ACK_MAX);
    await SecureStore.setItemAsync(HANDBACK_ACK_KEY, JSON.stringify(next));
  } catch {
    /* best-effort */
  }
}

export async function loadAcknowledgedHandbacks(): Promise<string[]> {
  return readHandbackAcks();
}

// The saved order-compose draft (home.tsx owns the write under this same key). Named here so sign-out
// can clear it — on a shared device the next user must not rehydrate the previous user's addresses.
const DRAFT_KEY = "lynia.orderDraft";

// Wipe all per-device, per-user state that must NOT survive a sign-out on a shared device (S1): the
// saved order draft (addresses), the accepted-disclaimer flag (so the next user still sees the
// liability gate), the role preference, and every stored one-time delivery code. The session key is
// cleared separately by `clearSession()`. Best-effort — a native failure must never trap sign-out.
export async function clearDeviceState(): Promise<void> {
  try {
    const codes = await readCodeIndex();
    await Promise.all([
      SecureStore.deleteItemAsync(DRAFT_KEY),
      SecureStore.deleteItemAsync(DISCLAIMER_KEY),
      SecureStore.deleteItemAsync(ROLE_PREF_KEY),
      SecureStore.deleteItemAsync(CODE_INDEX_KEY),
      SecureStore.deleteItemAsync(HANDBACK_ACK_KEY),
      // The rider's durable confirmItems-pending marker (a job id + collected item indexes) must not
      // survive to the next user on a shared device.
      SecureStore.deleteItemAsync(CONFIRM_ITEMS_PENDING_KEY),
      // The rider's durable delivered/undelivered terminal-acknowledgement marker must not survive to
      // the next user on a shared device (it would otherwise resurface a stranger's completed job).
      SecureStore.deleteItemAsync(RIDER_JOB_TERMINAL_KEY),
      // The customer's durable pending-rating marker (an order id + armed score) must not survive to
      // the next user on a shared device, or auto-submit a rating on the next user's account.
      SecureStore.deleteItemAsync(PENDING_RATING_KEY),
      // The rider's durable pending-sender-rating marker — same shared-device hazard as above.
      SecureStore.deleteItemAsync(PENDING_SENDER_RATING_KEY),
      // The rider's durable pending-topup marker — same shared-device hazard as above.
      SecureStore.deleteItemAsync(PENDING_TOPUP_KEY),
      // Address book: the saved Home/Work + recent places (addresses) and the recent recipients (the one
      // place we hold contact PII) must not survive to the next user on a shared device — exactly the
      // "next user must not rehydrate the previous user's addresses" rule above, now including recipients.
      SecureStore.deleteItemAsync(SAVED_PLACES_RECENTS_KEY),
      SecureStore.deleteItemAsync(SAVED_PLACES_SAVED_KEY),
      SecureStore.deleteItemAsync(RECIPIENTS_KEY),
      SecureStore.deleteItemAsync(MY_PICKUP_PHONE_KEY),
      // The KYC draft holds the rider's national ID — must never survive to the next user on a shared device.
      SecureStore.deleteItemAsync(KYC_DRAFT_KEY),
      // LC-C10: the profile-setup draft holds a national ID too — same shared-device hazard as the KYC draft.
      SecureStore.deleteItemAsync(PROFILE_DRAFT_KEY),
      // The cached trips list (holds this user's route landmarks) must not paint for the next user.
      SecureStore.deleteItemAsync(HISTORY_SNAPSHOT_KEY),
      // The cached chosen-rider identity (a third party's name + photo) must not survive to the next user.
      SecureStore.deleteItemAsync(RIDER_IDENTITY_KEY),
      // The rider's last-active job snapshot (route landmarks, fare, last GPS) — the next rider's cold
      // start reads this single-slot key via loadLastActiveJob() and would paint the previous rider's job.
      SecureStore.deleteItemAsync(JOB_KEY),
      // The customer's "an order may be in flight" hint — must not gate the next user's error banner
      // on the previous user's order.
      SecureStore.deleteItemAsync(ORDER_HINT_KEY),
      // The rider's in-progress bid draft (selected order + typed price/ETA) must not rehydrate for the next user.
      SecureStore.deleteItemAsync(RIDER_BID_DRAFT_KEY),
      // BH-23: the rider's list of already-sent bid offers this session (BH-21) must not rehydrate for the
      // next user on a shared device — it was added after this function was last touched and missed here,
      // the same gap PICKUP_CHECKLIST_DRAFT_KEY had (BH-17) for the same reason.
      SecureStore.deleteItemAsync(RIDER_SENT_OFFERS_KEY),
      // BH-17: the rider's pickup-item-verification draft (autosaved ticks) must not rehydrate for the
      // next user on a shared device — every other per-order/per-session draft key here already is wiped;
      // this one was missed when the draft itself was added.
      SecureStore.deleteItemAsync(PICKUP_CHECKLIST_DRAFT_KEY),
      // C-O7 (LC-C09): the pending/failed pickup-photo resume marker (a local file uri) must not
      // rehydrate for the next user on a shared device — added alongside PICKUP_CHECKLIST_DRAFT_KEY
      // above, wired here from the start rather than repeating the BH-17/BH-23 gap.
      SecureStore.deleteItemAsync(PICKUP_PHOTO_DRAFT_KEY),
      // D1 (browse): the cached restaurant list carries no PII, but the food cart draft is the
      // customer's own in-progress basket + notes — must not rehydrate onto the next user's account
      // on a shared device, same reasoning as HISTORY_SNAPSHOT_KEY above.
      SecureStore.deleteItemAsync(RESTAURANT_LIST_SNAPSHOT_KEY),
      SecureStore.deleteItemAsync(FOOD_CART_SNAPSHOT_KEY),
      // D2 (checkout): the last-placed food order's id/status snapshot (PII-free) must not rehydrate
      // onto the next user's account on a shared device, same reasoning as FOOD_CART_SNAPSHOT_KEY.
      SecureStore.deleteItemAsync(FOOD_ORDER_SNAPSHOT_KEY),
      // Note: the per-order `lynia.lastActive.<orderId>` keys are keyed by order id and not enumerable
      // (no index like CODE_INDEX_KEY), so they linger but are lower-risk — the next user isn't routed to
      // them (the tracker only reads a key it already holds the id for), so nothing paints from them.
      ...codes.map((id) => SecureStore.deleteItemAsync(codeKey(id))),
      // ...and each code's companion attempts high-water (keyed by the same order ids in the index).
      ...codes.map((id) => SecureStore.deleteItemAsync(codeAttemptsKey(id))),
      // ...and each code's companion rotation-timestamp baseline (same order ids in the index).
      ...codes.map((id) => SecureStore.deleteItemAsync(codeRotatedAtKey(id))),
      // D4: ...and each code's companion press-and-hold reveal log (same order ids in the index).
      ...codes.map((id) => SecureStore.deleteItemAsync(codeRevealedKey(id))),
    ]);
  } catch {
    /* best-effort */
  }
}
