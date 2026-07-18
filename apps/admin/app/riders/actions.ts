"use server";

import { revalidatePath } from "next/cache";
import { adminPost } from "../lib/api";

/** Approve/decline a rider's KYC from the review queue (the manual T7 backstop). */
export async function setKyc(formData: FormData): Promise<void> {
  const profileId = String(formData.get("profileId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!profileId || !(status === "verified" || status === "failed" || status === "pending")) return;

  // Surface a failed compliance write — silently failing-open on a KYC decision is unacceptable.
  const ok = await adminPost(`/admin/riders/${profileId}/kyc`, { status });
  if (!ok) throw new Error(`Failed to set KYC=${status} for rider ${profileId} (check API_BASE_URL / admin token).`);
  revalidatePath("/riders");
}

/**
 * A-02 KYC decision write from the doc-review screen. Approve → verified; decline → failed + the
 * reason code (recorded on the rider + audit log) and an attempt increment. A second decline pushes
 * `kycAttempts` to the lock (>= 2) → resubmission is blocked in the api. Called from <KycDecision>'s
 * <ConfirmModal> onConfirm. The endpoint now writes the audit row in the SAME transaction as the
 * decision (A-01), so <KycDecision> sets `auditInEndpoint` and does NOT also POST a standalone row —
 * this forwards the `note` so it lands on that in-transaction audit row.
 */
export async function decideKyc(
  profileId: string,
  status: "verified" | "failed",
  reasonCode: string | null,
  note?: string,
): Promise<void> {
  const body =
    status === "failed" ? { status, reasonCode, note: note || null } : { status, note: note || null };
  const ok = await adminPost(`/admin/riders/${profileId}/kyc`, body);
  if (!ok) throw new Error(`Failed to record KYC ${status} for rider ${profileId} (check API_BASE_URL / admin token).`);
  revalidatePath(`/riders/${profileId}/kyc`);
  // Also refresh the rider-detail page — it renders the KYC status pill this decision changes.
  revalidatePath(`/riders/${profileId}`);
  revalidatePath("/riders");
}

/**
 * Rider account-status mutations (item 1) — suspend / lift / ban via
 * `POST /admin/riders/:id/{suspend|lift|ban}`. The domain half of a <ConfirmModal> confirm (the audit
 * row is already written by submitAdminAction). `action` is the endpoint segment; the body carries the
 * audit envelope the endpoints accept. Suspend/ban require a reason (enforced in the modal). Throws on a
 * failed write; only fires against a live API since the triggers are disabled off the connected path.
 */
export async function mutateRider(
  profileId: string,
  action: "suspend" | "lift" | "ban" | "clear-hold",
  reasonCode: string | null,
  note: string,
): Promise<void> {
  // The suspend/ban/lift/clear-hold endpoints bind ReasonRequired/ReasonOptional = { reason, note? } —
  // NOT the audit envelope. Send `reason` (the reason-code radio), not `reasonCode`, or the write 400s
  // (suspend/ban need a non-empty reason, which the modal enforces; lift/clear-hold's is optional).
  const ok = await adminPost(`/admin/riders/${profileId}/${action}`, {
    reason: reasonCode ?? "",
    note: note || null,
  });
  if (!ok) throw new Error(`Failed to ${action} rider ${profileId} (check API_BASE_URL / admin token).`);
  revalidatePath(`/riders/${profileId}`);
  revalidatePath("/riders");
}

/**
 * DOC-16-03: record a manual prepaid credit to a rider's commission account from the console — the launch
 * top-up rail (grace credits, support corrections) that previously required a raw API call. Hits
 * `POST /admin/riders/:id/wallet-credit` (rail=manual); the endpoint's WalletService.creditManual writes
 * the ledger + audit row in its own transaction, attributing it to the middleware-asserted operator. The
 * idempotency key is minted per invocation — one confirmed submit = one credit. Amount is validated
 * server-side too (positive, ≤ the endpoint cap); this is a light client-side guard before the call.
 */
export async function creditRiderWallet(profileId: string, amount: string, note: string): Promise<void> {
  const value = Number(amount);
  if (!profileId || !Number.isFinite(value) || value <= 0) return;
  const ok = await adminPost(`/admin/riders/${profileId}/wallet-credit`, {
    amount: value,
    rail: "manual",
    idempotencyKey: crypto.randomUUID(),
    note: note || null,
  });
  if (!ok) throw new Error(`Failed to credit rider ${profileId}'s wallet (check API_BASE_URL / admin token).`);
  revalidatePath(`/riders/${profileId}`);
}
