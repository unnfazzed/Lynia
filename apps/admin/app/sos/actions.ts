"use server";

import { revalidatePath } from "next/cache";
import { adminPostResult, describeAdminPostFailure } from "../lib/api";

/**
 * Acknowledge an SOS (DS13-05) — the ops write that marks an emergency alert as being handled. POSTs
 * to `/admin/sos/:id/ack`; the API sets `acknowledgedAt` idempotently (CAS-guarded) and records the
 * audit row, so a double-click or a repeat ack is a harmless no-op server-side.
 *
 * Failure handling mirrors the compliance-write discipline in `adminPostResult`: `unconfigured` is the
 * offline/demo path (API_BASE_URL unset) and is a silent no-op; a real failure (`unreachable` network
 * error or an `http` non-2xx) throws so the operator sees the ack did NOT land rather than a false
 * "handled". Revalidates `/sos` so the row flips to acknowledged on success.
 */
export async function acknowledgeSos(id: string): Promise<void> {
  const res = await adminPostResult(`/admin/sos/${id}/ack`, {});
  // UX-2026-07-16: this used to say "check API_BASE_URL / admin token" for EVERY failure — dev/infra
  // diagnosis text shown to an operator mid-SOS-triage regardless of the real cause (an expired
  // session, a stale row, a genuine server error). describeAdminPostFailure (UX26-02) classifies by
  // the actual reason instead; `unconfigured` stays a silent no-op here (the offline/demo path).
  if (!res.ok && res.reason !== "unconfigured") throw new Error(describeAdminPostFailure(res));
  revalidatePath("/sos");
}
