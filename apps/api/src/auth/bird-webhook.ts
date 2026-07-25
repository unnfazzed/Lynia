import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Bird SMS delivery-status webhook. `POST /v1/sms/messages` returns 202 Accepted, which means Bird
 * TOOK the message — not that it reached the handset. Delivery is asynchronous
 * (`accepted → sent → delivered | undelivered | failed | rejected | expired`) and a non-delivery
 * surfaces ONLY as an async event here. Without this receiver those failures are invisible to both
 * the user (waiting on a code that will never arrive) and ops (no log, no metric) — the exact gap
 * `BirdOtpSender` documents at its 202 check.
 *
 * Bird uses the Standard Webhooks format: `webhook-id` / `webhook-timestamp` / `webhook-signature`.
 */

/** Terminal states where the OTP did NOT reach the handset. `undelivered` is non-permanent (handset
 *  off/unreachable); the rest are permanent. `sms.sent` and `sms.delivered` are not failures, and
 *  `sms.accepted` merely echoes what the send call already told us. */
const FAILURE_EVENT_TYPES = new Set(["sms.undelivered", "sms.failed", "sms.rejected", "sms.expired"]);

/** Bird's event envelope — narrowed to exactly the fields this receiver reads (Bird sends more). */
export interface BirdSmsEvent {
  type?: string;
  timestamp?: string;
  data?: {
    sms_id?: string;
    carrier?: string;
    mcc_mnc?: string;
    error?: { code?: string; description?: string; carrier_error_code?: string; occurred_at?: string };
  };
}

/** A non-delivery worth logging + counting. Deliberately carries no phone number: `to` is in the
 *  payload but never leaves this module (PII), and `sms_id` is what correlates back to the send. */
export interface BirdDeliveryFailure {
  /** Bare status (`undelivered` | `failed` | `rejected` | `expired`) — a closed set, safe as a label. */
  status: string;
  /** Bird's error code (e.g. `E12003`), or `"unknown"`. Closed enough for a metric label;
   *  `carrier_error_code` is deliberately NOT used — it is carrier-defined and unbounded. */
  code: string;
  smsId: string;
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Decode a Standard Webhooks signing secret into raw key bytes. Bird hands it over as
 * `whsec_<base64>` exactly once, at endpoint-creation time; the prefix is stripped and the remainder
 * base64-decoded before use as the HMAC key. A secret stored without the prefix still works.
 */
function decodeSigningSecret(secret: string): Buffer {
  return Buffer.from(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret, "base64");
}

/**
 * Verify Bird's `webhook-signature` header: HMAC-SHA256, base64, over the exact string
 * `{webhook-id}.{webhook-timestamp}.{raw body}`. The header carries one or more space-separated
 * `v1,<base64>` entries (Standard Webhooks allows several so a secret can be rotated without
 * dropping deliveries), so ANY matching v1 entry authenticates the request. Unknown version prefixes
 * are ignored rather than trusted. Constant-time compare throughout.
 *
 * The signature covers the id and timestamp as well as the body, so neither can be tampered with to
 * defeat the replay window checked by `isWebhookTimestampFresh`.
 */
export function verifyBirdSignature(
  rawBody: string,
  headers: { id: string | undefined; timestamp: string | undefined; signature: string | undefined },
  secret: string,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const key = decodeSigningSecret(secret);
  if (key.length === 0) return false;

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`, "utf8").digest("base64");

  for (const part of signature.split(" ")) {
    const [version, candidate] = part.split(",", 2);
    if (version !== "v1" || !candidate) continue;
    if (constantTimeEquals(expected, candidate)) return true;
  }
  return false;
}

/** Bird rejects deliveries older than 5 minutes; mirror that so a captured-and-replayed delivery is
 *  refused even though its signature is genuine and forever valid. */
export const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

/**
 * True when `webhook-timestamp` (unix seconds) is inside the replay window. Applied in BOTH
 * directions: a far-future timestamp is as suspect as an old one, and rejecting it also stops a
 * clock-skewed sender from minting deliveries that stay valid indefinitely. A non-numeric header
 * fails closed.
 */
export function isWebhookTimestampFresh(
  timestampHeader: string | undefined,
  nowSeconds: number,
  toleranceSeconds: number = WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
): boolean {
  if (!timestampHeader) return false;
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;
  return Math.abs(nowSeconds - ts) <= toleranceSeconds;
}

/**
 * Map an event to a delivery failure, or null when it is a success/progress event (or malformed).
 * Best-effort: a shape Bird changes later degrades to null rather than throwing — this is
 * observability, never a reason to 500 a webhook and trigger Bird's retry storm.
 */
export function extractDeliveryFailure(event: BirdSmsEvent): BirdDeliveryFailure | null {
  const type = event?.type;
  if (!type || !FAILURE_EVENT_TYPES.has(type)) return null;
  const code = event.data?.error?.code?.trim();
  return {
    status: type.slice("sms.".length),
    code: code && code.length > 0 ? code : "unknown",
    smsId: event.data?.sms_id ?? "unknown",
  };
}
