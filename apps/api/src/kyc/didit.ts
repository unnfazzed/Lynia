import { createHmac, timingSafeEqual } from "node:crypto";

export type RiderKyc = "verified" | "failed" | "pending";

/**
 * Map a Didit verification status to our rider kyc_status.
 * Approved → verified; Declined/Expired → failed; everything else (In Review, In Progress,
 * Not Started, Abandoned, …) stays pending — the admin manual-review backstop (T7) covers it.
 */
export function mapDiditStatus(status: string): RiderKyc {
  switch (status.trim().toLowerCase()) {
    case "approved":
      return "verified";
    case "declined":
    case "expired":
      return "failed";
    default:
      return "pending";
  }
}

/**
 * Verify a Didit webhook HMAC signature. Didit signs the raw request body with HMAC-SHA256 using
 * the webhook secret and sends the hex digest in a header. Constant-time compare.
 */
export function verifyDiditSignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Replay guard. A valid HMAC over an old body is still a replay, so Didit sends the send-time in
 * the X-Timestamp header; reject a webhook whose timestamp is outside the tolerance window.
 *
 * Deliberately **fail-open** on a missing or unparseable header (returns "not stale"): the HMAC
 * already authenticates the request, so a header we can't read must never reject a genuine webhook
 * and silently break KYC. We only fail-closed when we can parse a timestamp and it is clearly
 * outside the window. Epoch-millis is tolerated so a seconds/millis unit change can't reject all.
 */
export function diditTimestampStale(
  timestampHeader: string | undefined,
  nowMs: number,
  toleranceSec = 300,
): boolean {
  if (!timestampHeader) return false;
  let ts = Number(timestampHeader.trim());
  if (!Number.isFinite(ts)) return false;
  if (ts > 1e12) ts = ts / 1000; // tolerate epoch-millis (seconds in 2026 are ~1.7e9)
  return Math.abs(nowMs / 1000 - ts) > toleranceSec;
}
