"use server";

import { revalidatePath } from "next/cache";
import { adminPost } from "../lib/api";

/**
 * The single write path behind every destructive console action (suspend / lift / ban / decline /
 * refund / cancel / resolve / settle). <ConfirmModal> submits its form here carrying
 * `{ action, target, reasonCode, note }` plus the `path` to revalidate.
 *
 * TODO(A-01): audit-log write path — api-side table pending. The `/admin/audit-actions` endpoint
 * does not exist yet; `adminPost` no-ops (returns false) when API_BASE_URL is unset, so the console
 * degrades gracefully in the offline/demo path instead of throwing. When A-01 lands api-side, the
 * mutation + the audit row must be written in the SAME transaction (see plan §B "Audit"). This is
 * the UI seam only — do NOT implement the API side here.
 */
export async function submitAdminAction(formData: FormData): Promise<void> {
  const action = String(formData.get("action") ?? "");
  const target = String(formData.get("target") ?? "");
  const reasonCode = String(formData.get("reasonCode") ?? "") || null;
  const note = String(formData.get("note") ?? "") || null;
  const path = String(formData.get("path") ?? "") || "/";

  if (!action || !target) return;

  await adminPost("/admin/audit-actions", { action, target, reasonCode, note });

  // Refresh the originating page so a live console reflects the mutation. Safe no-op effect on the
  // degraded path (nothing changed server-side because adminPost returned false).
  revalidatePath(path);
}
