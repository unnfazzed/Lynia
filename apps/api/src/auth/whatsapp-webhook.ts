import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta WhatsApp Cloud API delivery-status webhook (INTERFACE-AUDIT WA-01). `POST /messages` only
 * confirms the send was accepted into Meta's queue, not that it reached the device — a bad number,
 * quality-rating throttling, or the recipient blocking the business all surface ONLY as an async
 * `message_status` event here. Without this receiver those failures are invisible to both the user
 * (left waiting on a code that will never arrive) and ops (no log, no metric).
 */

/** Meta's callback body — narrowed to exactly the fields this receiver reads (Graph API sends more). */
export interface WhatsappStatusPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{
          status?: string;
          errors?: Array<{ title?: string; message?: string }>;
        }>;
      };
    }>;
  }>;
}

function constantTimeHexEquals(expectedHex: string, headerHex: string): boolean {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(headerHex.trim(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify Meta's `X-Hub-Signature-256` header — `sha256=<hex hmac>` over the verbatim raw request
 * body, keyed on the Meta App Secret (`WHATSAPP_APP_SECRET`, distinct from the send-side
 * `WHATSAPP_ACCESS_TOKEN`). Constant-time compare against a forged/guessed signature.
 */
export function verifyMetaSignature(rawBody: string, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return constantTimeHexEquals(expected, signatureHeader.slice(prefix.length));
}

/**
 * Flatten every `statuses[]` entry across `entry[].changes[].value.statuses[]` whose `status` is
 * `"failed"` into a short, PII-free reason string per entry (Meta's `errors[].title`, falling back to
 * the raw status, never the recipient's phone number — that lives in a sibling field this type
 * doesn't even declare). Malformed/missing shapes degrade to an empty list rather than throwing —
 * this is best-effort observability, never a reason to 500 the webhook.
 */
export function extractFailedDeliveryReasons(payload: WhatsappStatusPayload): string[] {
  const reasons: string[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        if (status?.status !== "failed") continue;
        const title = status.errors?.[0]?.title?.trim();
        reasons.push(title && title.length > 0 ? title : "failed");
      }
    }
  }
  return reasons;
}
