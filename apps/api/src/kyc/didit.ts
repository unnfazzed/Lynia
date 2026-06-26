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
