"use server";

import type { FleetAdminReasonCode } from "@lynia/shared";
import { revalidatePath } from "next/cache";
import { adminPostResult, describeAdminPostFailure } from "../lib/api";

/**
 * Own bikers in the console (OB-A2/A3, ledger D-117): the side panel's writes. Each endpoint writes its own audit row
 * with the operator in the same transaction, so the modals set `auditInEndpoint`. A refusal comes back in the API's own
 * words (a thrown server-action message is redacted in production).
 */
export type FleetWriteResult = { ok: true } | { ok: false; message: string };

const PAGE = "/own-bikers";

async function post(path: string, body: unknown): Promise<FleetWriteResult> {
  const res = await adminPostResult(path, body);
  if (!res.ok) return { ok: false, message: describeAdminPostFailure(res) };
  revalidatePath(PAGE);
  revalidatePath("/");
  return { ok: true };
}

/** "Fee per ride" · Save. The fee endpoint needs a note for its audit row; the console writes what changed. */
export async function setFleetFee(ownerId: string, rideFee: number, from: string | null): Promise<FleetWriteResult> {
  return post(`/admin/fleets/${ownerId}/fee`, { rideFee, note: `Fee per ride ${from ?? "none"} → ${rideFee.toFixed(2)}` });
}

/** OB-A3 Pause / Unpause / Disable: a reason code and a note for the audit log. */
export async function switchFleet(
  ownerId: string,
  action: "pause" | "unpause" | "disable",
  reasonCode: FleetAdminReasonCode,
  note: string,
): Promise<FleetWriteResult> {
  return post(`/admin/fleets/${ownerId}/${action}`, { reasonCode, ...(note.trim() ? { note: note.trim() } : {}) });
}

/** OB-A2 "Mark paid". */
export async function markFleetBillPaid(billId: string): Promise<FleetWriteResult> {
  return post(`/admin/fleets/bills/${billId}/paid`, {});
}

/** OB-A2 "Adjust": an amount, a reason and the ride (which names the branch it's billed to). */
export async function adjustFleet(ownerId: string, body: { merchantId: string; orderId: string; amount: number; reason: string }): Promise<FleetWriteResult> {
  return post(`/admin/fleets/${ownerId}/adjust`, body);
}
