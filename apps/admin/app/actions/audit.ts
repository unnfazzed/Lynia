"use server";

import { revalidatePath } from "next/cache";
import { adminPostResult } from "../lib/api";

/**
 * The single write path behind every destructive console action (suspend / lift / ban / decline /
 * refund / cancel / resolve / settle). <ConfirmModal> submits its form here carrying
 * `{ action, target, reasonCode, note }` plus the `path` to revalidate.
 *
 * A-01: audit-log write path — the `POST /admin/audit-actions` endpoint now EXISTS api-side, so this
 * write path is live (it persists the audit row from `{ action, target, reasonCode, note }`). When
 * API_BASE_URL is unset `adminPost` still no-ops (returns false), so the console keeps degrading
 * gracefully in the offline/demo path instead of throwing. FUTURE: once a real console-driven
 * mutation is wired up, that mutation + the audit row must be written in the SAME transaction (see
 * plan §B "Audit"). This is the UI seam only — do NOT implement the API side here.
 */
export async function submitAdminAction(formData: FormData): Promise<void> {
  const action = String(formData.get("action") ?? "");
  const target = String(formData.get("target") ?? "");
  const reasonCode = String(formData.get("reasonCode") ?? "") || null;
  const note = String(formData.get("note") ?? "") || null;
  const path = String(formData.get("path") ?? "") || "/";

  if (!action || !target) return;

  const result = await adminPostResult("/admin/audit-actions", { action, target, reasonCode, note });

  // Distinguish an intentional offline no-op from a real failure. `unconfigured` (API_BASE_URL unset,
  // the demo/offline path) stays a silent no-op so the console degrades gracefully. A genuine write
  // failure (network error or non-2xx) MUST throw so the awaiting <ConfirmModal> keeps the dialog open
  // and tells the operator the action was NOT recorded — a swallowed audit-write is unacceptable.
  if (!result.ok && result.reason !== "unconfigured") {
    const detail = result.reason === "http" ? `HTTP ${result.status}` : "API unreachable";
    throw new Error(`Failed to record audit action "${action}" for ${target} (${detail}).`);
  }

  // Refresh the originating page so a live console reflects the mutation. Safe no-op effect on the
  // degraded/offline path (nothing changed server-side because the write was skipped).
  revalidatePath(path);
}

/**
 * F-07: dedicated write path for the order-detail "log a follow-up note" control.
 *
 * The generic submitAdminAction reads `action`/`target`/`path` from the form, so exposing it there
 * with client-visible hidden inputs let a user rewrite them and forge an arbitrary audit row (e.g.
 * action=rider.ban against any target). This action instead hardcodes the action and derives the
 * target/path from `orderId`, which is a server-bound argument (encrypted by Next, not client-supplied
 * form data), so the client can choose neither the action nor the target. Operator attribution is
 * unchanged — adminPostResult still forwards the middleware-asserted operator.
 */
export async function logOrderFollowUpNote(orderId: string, _formData: FormData): Promise<void> {
  if (!orderId) return;
  const action = "order.nudge_rider";
  const path = `/orders/${orderId}`;

  const result = await adminPostResult("/admin/audit-actions", {
    action,
    target: orderId,
    reasonCode: null,
    note: null,
  });

  if (!result.ok && result.reason !== "unconfigured") {
    const detail = result.reason === "http" ? `HTTP ${result.status}` : "API unreachable";
    throw new Error(`Failed to record audit action "${action}" for ${orderId} (${detail}).`);
  }

  revalidatePath(path);
}
