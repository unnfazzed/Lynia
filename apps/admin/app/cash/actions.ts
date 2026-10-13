"use server";

import { revalidatePath } from "next/cache";
import { adminPostResult, describeAdminPostFailure } from "../lib/api";

/**
 * Admin console v2 §6: the top-up actions and the integrity "Run now". Each top-up endpoint writes its own
 * audit row (the modals set `auditInEndpoint`), takes the ConfirmModal reason as `reason`, and THROWS on a
 * refusal so the dialog stays open with the API's words.
 */
export type TopupAction = "repoll" | "credit-paid" | "resolve";
const TOPUP_ACTIONS: readonly TopupAction[] = ["repoll", "credit-paid", "resolve"];

const FAILED: Record<TopupAction, string> = {
  repoll: "Couldn't ask Paynow",
  "credit-paid": "Couldn't credit the top-up",
  resolve: "Couldn't mark it resolved",
};

export async function topupAction(topUpId: string, action: TopupAction, reasonCode: string | null, note: string): Promise<void> {
  // `action` is interpolated into the path: refuse anything outside the known set.
  if (!TOPUP_ACTIONS.includes(action)) throw new Error(`Unknown top-up action: ${action}`);
  if (!topUpId) throw new Error("No top-up — reload the page.");
  const res = await adminPostResult(`/admin/topups/${topUpId}/${action}`, { reason: reasonCode ?? "", note: note || null });
  if (!res.ok) throw new Error(`${FAILED[action]}: ${describeAdminPostFailure(res)}`);
  revalidatePath("/cash/topups");
  revalidatePath("/cash");
}

/** Run the wallet integrity sweep now (the nightly job's endpoint). The panel then shows its result. */
export async function runIntegrityCheck(): Promise<void> {
  await adminPostResult("/admin/wallet/integrity-check", {});
  revalidatePath("/cash");
}
