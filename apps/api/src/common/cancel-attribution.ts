/**
 * Admin console v2 §3: who cancelled an order (by ROLE), the stage it was in, and a structured reason code —
 * the three columns every cancel path stamps (`Order.cancelledByRole` / `cancelStage` / `cancelReasonCode`).
 * Pure, so each path spreads the same mapping into its own cancel write (inside its own CAS / transaction)
 * and the table-driven spec pins it once.
 *
 * `cancelReason` stays the free-text note; `cancelledBy` stays the profile id (null for system cancels).
 */

export type CancelledByRole = "customer" | "rider" | "merchant" | "admin" | "system";

export const CANCELLED_BY_ROLES: readonly CancelledByRole[] = ["customer", "rider", "merchant", "admin", "system"];

/** The structured code a system cancel carries when its caller has nothing more specific. */
export const SYSTEM_TIMEOUT_CODE = "timeout";

/** Codes are short snake_case tokens; anything else (free text, an over-long string) is not a code. */
const CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;

export interface CancelAttributionInput {
  by: CancelledByRole;
  /** The order's status at cancel time (before the write). */
  status: string;
  /** For a merchant order: its kitchen phase at cancel time. Wins over `status` while the order is still
   *  pre-dispatch (`requested`), since `requested` alone says nothing about where the kitchen was. */
  merchantPhase?: string | null;
  /** A structured reason (admin reason code, merchant rejection code, undelivered reason…). Free text is
   *  dropped — it belongs in `cancelReason`. */
  reasonCode?: string | null;
}

export interface CancelAttribution {
  cancelledByRole: CancelledByRole;
  cancelStage: string;
  cancelReasonCode: string | null;
}

/** The stage an order was cancelled in: the merchant phase for a pre-dispatch merchant order, else the status. */
export function cancelStageOf(status: string, merchantPhase?: string | null): string {
  if (merchantPhase && status === "requested") return merchantPhase;
  return status;
}

/** A structured code, or null for free text / blanks. */
export function normaliseReasonCode(code: string | null | undefined): string | null {
  if (code == null) return null;
  const c = code.trim();
  return CODE_RE.test(c) ? c : null;
}

export function cancelAttribution(input: CancelAttributionInput): CancelAttribution {
  const code = normaliseReasonCode(input.reasonCode);
  return {
    cancelledByRole: input.by,
    cancelStage: cancelStageOf(input.status, input.merchantPhase),
    cancelReasonCode: code ?? (input.by === "system" ? SYSTEM_TIMEOUT_CODE : null),
  };
}
