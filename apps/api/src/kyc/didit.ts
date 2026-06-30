import { createHmac, timingSafeEqual } from "node:crypto";

export type RiderKyc = "verified" | "failed" | "pending";

/**
 * Map a Didit verification status to our rider kyc_status. Statuses are exact, case-sensitive
 * literals (V3): Not Started, In Progress, Awaiting User, In Review, Approved, Declined,
 * Resubmitted, Abandoned, Expired, Kyc Expired.
 *
 * Approved → verified. Declined and "Kyc Expired" (a previously-verified rider whose KYC has aged
 * out per retention policy → must re-verify) → failed. Everything else — including session "Expired"
 * (the hosted URL aged out before the rider finished, so they can simply retry) — stays pending, and
 * the admin manual-review backstop (T7) resolves anything stuck.
 */
export function mapDiditStatus(status: string): RiderKyc {
  switch (status.trim().toLowerCase()) {
    case "approved":
      return "verified";
    case "declined":
    case "kyc expired":
      return "failed";
    default:
      // Not Started | In Progress | Awaiting User | In Review | Resubmitted | Abandoned | Expired
      return "pending";
  }
}

/**
 * Whole-number floats (1.0) → integers (1), recursively. Part of the X-Signature-V2 canonical form;
 * matches Didit's server-side canonicalisation. (Mostly a no-op in JS, where JSON.parse already
 * collapses 1.0 → 1 — kept for exact parity with the documented contract.)
 */
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)]));
  }
  if (typeof v === "number" && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

/** Recursive lexicographic key sort (array order preserved). */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}

/** Canonical body for the X-Signature-V2 HMAC: shortenFloats → sortKeys → JSON.stringify (the JS
 *  default emits unescaped Unicode, matching Didit's canonical form). Throws on non-JSON input. */
export function canonicalizeDiditBody(rawBody: string): string {
  return JSON.stringify(sortKeys(shortenFloats(JSON.parse(rawBody))));
}

function constantTimeHexEquals(expectedHex: string, headerHex: string | undefined): boolean {
  if (!headerHex) return false;
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(headerHex.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify the **X-Signature-V2** webhook signature (Didit's recommended header — it survives JSON
 * middleware re-encoding because both sides sign a canonical re-serialisation, not the raw bytes).
 * Didit HMAC-SHA256s the canonical body with the destination's signing secret; constant-time compare.
 */
export function verifyDiditSignatureV2(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  let canonical: string;
  try {
    canonical = canonicalizeDiditBody(rawBody);
  } catch {
    return false;
  }
  const expected = createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
  return constantTimeHexEquals(expected, signatureHeader);
}

/**
 * Verify the legacy **X-Signature** (raw-bytes) header — HMAC-SHA256 over the verbatim request body.
 * Only trustworthy when nothing re-encodes the body before we hash it; we preserve `req.rawBody`, so
 * it works as a fallback for a webhook delivery that carries no X-Signature-V2.
 */
export function verifyDiditSignature(rawBody: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return constantTimeHexEquals(expected, signatureHeader);
}

/**
 * Freshness check (replay protection). Didit sends the send-time in the X-Timestamp header (Unix
 * seconds); reject anything outside a 300s window — a valid HMAC over an old body is still a replay.
 *
 * Fail-closed: a missing or unparseable timestamp is NOT fresh, because a V3 destination always
 * sends one. Epoch-millis is tolerated so a seconds/millis unit difference can't reject everything.
 */
export function diditTimestampFresh(timestampHeader: string | undefined, nowMs: number, toleranceSec = 300): boolean {
  if (!timestampHeader) return false;
  let ts = Number(timestampHeader.trim());
  if (!Number.isFinite(ts)) return false;
  if (ts > 1e12) ts = ts / 1000; // tolerate epoch-millis (seconds in 2026 are ~1.7e9)
  return Math.abs(nowMs / 1000 - ts) <= toleranceSec;
}
