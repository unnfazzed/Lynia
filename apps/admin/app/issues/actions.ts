"use server";

import { revalidatePath } from "next/cache";
import type { IssueResolution, ResolveIssueRequest } from "@lynia/shared";
import { adminPostResult, describeAdminPostFailure } from "../lib/api";

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
  // Typed against the shared schema so a shape drift is a compile error, not a silent 400. `note` is
  // `.optional()` (string|undefined — NOT nullable), so omit it when empty rather than sending null;
  // `refundAmount` is a `number`, so coerce the numeric-string input.
  const body: ResolveIssueRequest = {
    resolution,
    ...(note ? { note } : {}),
    ...(resolution === "refund" && refundAmount ? { refundAmount: Number(refundAmount) } : {}),
  };

  const res = await adminPostResult(`/admin/issues/${id}/resolve`, body);
  if (!res.ok) throw new Error(`Failed to resolve issue ${id} as ${resolution}: ${describeAdminPostFailure(res)}`);

  revalidatePath(`/issues/${id}`);
  revalidatePath("/issues");
}
