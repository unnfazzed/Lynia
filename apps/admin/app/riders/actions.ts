"use server";

import { revalidatePath } from "next/cache";
import { adminPostResult, describeAdminPostFailure } from "../lib/api";
import { REVERSAL_CAP } from "../lib/money-labels";

/**
 * A KYC write's outcome. The failure is RETURNED, not thrown: Next redacts a server action's thrown
 * message in production, and a refused decision has to reach the operator in the API's own words (D-75:
 * "Can't approve: the national ID from this rider's ID check is already on another live account…").
 * Callers re-throw it client-side for <ConfirmModal>.
 */
export type KycWriteResult = { ok: true } | { ok: false; message: string };

/**
 * A-02 KYC decision write from the doc-review screen. Approve → verified; decline → failed + the
 * reason code (recorded on the rider + audit log) and an attempt increment. A second decline pushes
 * `kycAttempts` to the lock (>= 2) → resubmission is blocked in the api. Called from <KycDecision>'s
 * <ConfirmModal> onConfirm. The endpoint now writes the audit row in the SAME transaction as the
 * decision (A-01), so <KycDecision> sets `auditInEndpoint` and does NOT also POST a standalone row —
 * this forwards the `note` so it lands on that in-transaction audit row. A refusal comes back as a
 * failed `KycWriteResult` (see above) that <KycDecision> re-throws for the modal to show.
 */
export async function decideKyc(
  profileId: string,
  status: "verified" | "failed",
  reasonCode: string | null,
  note?: string,
): Promise<KycWriteResult> {
  const body =
    status === "failed" ? { status, reasonCode, note: note || null } : { status, note: note || null };
  const res = await adminPostResult(`/admin/riders/${profileId}/kyc`, body);
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidatePath(`/riders/${profileId}/kyc`);
  // Also refresh the rider-detail page — it renders the KYC status pill this decision changes.
  revalidatePath(`/riders/${profileId}`);
  revalidatePath("/riders");
  return { ok: true };
}

/**
 * Give a biker their ID-check tries back (owner 2026-10-12): `POST /admin/riders/:id/kyc { status: "pending",
 * resetAttempts: true }`. The endpoint zeroes the attempt counter, clears the decline reason and reopens the
 * check in one transaction, with its `rider.kyc_reset` audit row (A-01), so <KycDecision> sets
 * `auditInEndpoint`. The biker gets a "Finish your ID check" push. A refusal comes back as a failed
 * `KycWriteResult`, like decideKyc.
 */
export async function resetKycAttempts(profileId: string, note?: string): Promise<KycWriteResult> {
  const res = await adminPostResult(`/admin/riders/${profileId}/kyc`, { status: "pending", resetAttempts: true, note: note || null });
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidatePath(`/riders/${profileId}/kyc`);
  revalidatePath(`/riders/${profileId}`);
  revalidatePath("/riders");
  return { ok: true };
}

/**
 * Owner 2026-10-15: ask a verified biker for a new selfie check (`request` — the biker gets a reminder push and a
 * Redo on Bike & documents; it never stops them going online), or mark their selfie checked (`clear`).
 * `POST /admin/riders/:id/selfie-check` writes the flag and its audit row in one transaction, so the modal sets
 * `auditInEndpoint`. A refusal (e.g. the biker isn't verified) comes back as a failed `KycWriteResult`.
 */
export async function setSelfieCheck(profileId: string, action: "request" | "clear", note?: string): Promise<KycWriteResult> {
  const res = await adminPostResult(`/admin/riders/${profileId}/selfie-check`, { action, note: note || null });
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidatePath(`/riders/${profileId}/kyc`);
  revalidatePath(`/riders/${profileId}`);
  return { ok: true };
}

/**
 * Rider account-status mutations (item 1) — suspend / lift / ban via
 * `POST /admin/riders/:id/{suspend|lift|ban}`. The domain half of a <ConfirmModal> confirm (the audit
 * row is already written by submitAdminAction). `action` is the endpoint segment; the body carries the
 * audit envelope the endpoints accept. Suspend/ban require a reason (enforced in the modal). Throws on a
 * failed write; only fires against a live API since the triggers are disabled off the connected path.
 */
const RIDER_ACTIONS = ["suspend", "lift", "ban", "clear-hold"] as const;

export async function mutateRider(
  profileId: string,
  action: "suspend" | "lift" | "ban" | "clear-hold",
  reasonCode: string | null,
  note: string,
): Promise<void> {
  // Defense-in-depth: `action` is interpolated into the endpoint path, so refuse anything outside the
  // known set even though every caller passes a literal (the type already constrains compile-time callers).
  if (!(RIDER_ACTIONS as readonly string[]).includes(action)) throw new Error(`Unknown biker action: ${action}`);
  // The suspend/ban/lift/clear-hold endpoints bind ReasonRequired/ReasonOptional = { reason, note? } —
  // NOT the audit envelope. Send `reason` (the reason-code radio), not `reasonCode`, or the write 400s
  // (suspend/ban need a non-empty reason, which the modal enforces; lift/clear-hold's is optional).
  const res = await adminPostResult(`/admin/riders/${profileId}/${action}`, {
    reason: reasonCode ?? "",
    note: note || null,
  });
  if (!res.ok) throw new Error(`Failed to ${action} biker ${profileId}: ${describeAdminPostFailure(res)}`);
  revalidatePath(`/riders/${profileId}`);
  revalidatePath("/riders");
}

/**
 * First Run v2 E4 (D-82): confirm the bike plate a rider saved from Bike & documents —
 * `POST /admin/riders/:id/plate-verify { plate, reason, note }`. `plate` is the plate ops looked at: the
 * endpoint refuses (409) if the rider changed it since, so an unseen plate is never marked verified. The
 * endpoint writes the `rider.plate_verify` audit row in its own transaction. Throws on a refusal so
 * <ConfirmModal> keeps the dialog open with the API's words.
 */
export async function verifyPlate(profileId: string, plate: string, reasonCode: string | null, note: string): Promise<void> {
  if (!profileId || !plate) throw new Error("This biker has no plate to confirm — reload the page.");
  const res = await adminPostResult(`/admin/riders/${profileId}/plate-verify`, {
    plate,
    reason: reasonCode ?? null,
    note: note || null,
  });
  if (!res.ok) throw new Error(`Couldn't confirm the plate: ${describeAdminPostFailure(res)}`);
  revalidatePath(`/riders/${profileId}`);
  revalidatePath("/riders");
}

/**
 * DOC-16-03: record a manual prepaid credit to a rider's commission account from the console — the launch
 * top-up rail (grace credits, support corrections) that previously required a raw API call. Hits
 * `POST /admin/riders/:id/wallet-credit` (rail=manual); the endpoint's WalletService.creditManual writes
 * the ledger + audit row in its own transaction, attributing it to the middleware-asserted operator.
 *
 * `idempotencyKey` is the FORM-OPEN key from <ConfirmModal> (minted when the credit dialog opened, stable
 * across retries within that open). Forwarding it — rather than minting a fresh one per server-action call —
 * means a lost-response retry re-sends the SAME key, so the endpoint's exactly-once dedup collapses it to a
 * single credit instead of double-crediting real balance. A brand-new dialog open mints a new key, so two
 * genuinely-separate credits are never deduped away. (Server-side fallback mints one only if the client
 * somehow sent none.) A bad amount THROWS so the modal keeps the dialog open with the error.
 */
export async function creditRiderWallet(
  profileId: string,
  amount: string,
  note: string,
  idempotencyKey: string,
): Promise<void> {
  if (!profileId) return;
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Enter a positive amount to credit.");
  }
  const res = await adminPostResult(`/admin/riders/${profileId}/wallet-credit`, {
    amount: value,
    rail: "manual",
    idempotencyKey: idempotencyKey && idempotencyKey.length > 0 ? idempotencyKey : crypto.randomUUID(),
    note: note || null,
  });
  if (!res.ok) throw new Error(`Failed to credit biker ${profileId}'s wallet: ${describeAdminPostFailure(res)}`);
  revalidatePath(`/riders/${profileId}`);
}

/**
 * Admin console v2 §6: a reversal — take money OFF a biker's balance (`POST /admin/riders/:id/wallet-reversal`).
 * Reason-coded, note required (the biker sees it), capped at {@link REVERSAL_CAP}; `entryId` names the credit
 * it corrects (the API refuses more than is left of it). The endpoint writes the ledger row and the audit row
 * (before / after balance) in one transaction. Forwards the form-open key so a retry can't debit twice.
 * Throws so <ConfirmModal> keeps the dialog open with the reason.
 */
export async function reverseRiderWallet(
  profileId: string,
  amount: string,
  reasonCode: string | null,
  note: string,
  idempotencyKey: string,
  entryId?: string | null,
): Promise<void> {
  if (!profileId) return;
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter the amount to take off.");
  if (value > REVERSAL_CAP) throw new Error(`One reversal can take off at most $${REVERSAL_CAP.toFixed(2)}.`);
  if (!note.trim()) throw new Error("Add a note: the biker sees it.");
  const res = await adminPostResult(`/admin/riders/${profileId}/wallet-reversal`, {
    amount: Math.round(value * 100) / 100,
    reason: reasonCode ?? "",
    note: note.trim(),
    entryId: entryId ?? null,
    idempotencyKey: idempotencyKey && idempotencyKey.length > 0 ? idempotencyKey : crypto.randomUUID(),
  });
  if (!res.ok) throw new Error(`Couldn't reverse: ${describeAdminPostFailure(res)}`);
  revalidatePath(`/riders/${profileId}`);
  revalidatePath("/cash");
  revalidatePath("/cash/owed");
}
