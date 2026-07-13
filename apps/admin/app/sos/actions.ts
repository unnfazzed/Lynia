"use server";

import { revalidatePath } from "next/cache";
import { adminPostResult } from "../lib/api";

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
  if (!res.ok && res.reason !== "unconfigured") {
    const detail = res.reason === "http" ? `HTTP ${res.status}` : res.reason;
    throw new Error(`Failed to acknowledge SOS ${id} (${detail}) — check API_BASE_URL / admin token.`);
  }
  revalidatePath("/sos");
}
