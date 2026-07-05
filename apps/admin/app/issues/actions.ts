"use server";

import { revalidatePath } from "next/cache";
import type { IssueResolution } from "@lynia/shared";
import { adminPost } from "../lib/api";

/**
 * Resolve a dispute (A-05) — the domain half of a <ConfirmModal> confirm on the investigation screen.
 * The audit-log row is already written by the modal's `submitAdminAction` (the audit seam, carrying the
 * reason code + note); this writes the outcome via `POST /admin/issues/:id/resolve`, body
 * `{ resolution, note?, refundAmount? }`. A `refund` resolution carries the cash amount handed to the
 * customer; `rider_strike` and `close_no_action` carry only the note. Throws on a failed write — the
 * triggers are disabled off the connected path, so this only fires against a live API.
 */
export async function resolveIssue(
  id: string,
  resolution: IssueResolution,
  note: string,
  refundAmount?: string,
): Promise<void> {
  const body: Record<string, unknown> = { resolution, note: note || null };
  if (resolution === "refund") body.refundAmount = refundAmount || null;

  const ok = await adminPost(`/admin/issues/${id}/resolve`, body);
  if (!ok) throw new Error(`Failed to resolve issue ${id} as ${resolution} (check API_BASE_URL / admin token).`);

  revalidatePath(`/issues/${id}`);
  revalidatePath("/issues");
}
