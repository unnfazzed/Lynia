import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type BirdSmsEvent,
  extractDeliveryFailure,
  isWebhookTimestampFresh,
  verifyBirdSignature,
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS,
} from "./bird-webhook";

// Bird hands the secret over as `whsec_<base64>`; the key is the DECODED remainder.
const RAW_KEY = Buffer.from("bird-webhook-signing-key-0123456789");
const SECRET = `whsec_${RAW_KEY.toString("base64")}`;

const sign = (id: string, ts: string, body: string, key: Buffer = RAW_KEY): string =>
  `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`, "utf8").digest("base64")}`;

const ID = "msg_2b1c";
const TS = "1784500000";
const BODY = '{"type":"sms.delivered","data":{"sms_id":"sms_01"}}';

describe("verifyBirdSignature", () => {
  it("accepts a correctly signed delivery", () => {
    const headers = { id: ID, timestamp: TS, signature: sign(ID, TS, BODY) };
    expect(verifyBirdSignature(BODY, headers, SECRET)).toBe(true);
  });

  it("accepts a secret stored without the whsec_ prefix", () => {
    const headers = { id: ID, timestamp: TS, signature: sign(ID, TS, BODY) };
    expect(verifyBirdSignature(BODY, headers, RAW_KEY.toString("base64"))).toBe(true);
  });

  // Standard Webhooks sends several signatures during a secret rotation; any valid one authenticates.
  it("accepts when one of several space-separated signatures matches", () => {
    const wrong = sign(ID, TS, BODY, Buffer.from("some-other-key"));
    const headers = { id: ID, timestamp: TS, signature: `${wrong} ${sign(ID, TS, BODY)}` };
    expect(verifyBirdSignature(BODY, headers, SECRET)).toBe(true);
  });

  it("rejects a body tampered with after signing", () => {
    const headers = { id: ID, timestamp: TS, signature: sign(ID, TS, BODY) };
    expect(verifyBirdSignature(`${BODY} `, headers, SECRET)).toBe(false);
  });

  // The id and timestamp are inside the signed string precisely so neither can be swapped to dodge
  // the replay window while keeping a genuine signature.
  it("rejects a swapped webhook-id or webhook-timestamp", () => {
    const sig = sign(ID, TS, BODY);
    expect(verifyBirdSignature(BODY, { id: "msg_other", timestamp: TS, signature: sig }, SECRET)).toBe(false);
    expect(verifyBirdSignature(BODY, { id: ID, timestamp: "1784509999", signature: sig }, SECRET)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const forged = sign(ID, TS, BODY, Buffer.from("attacker-key"));
    expect(verifyBirdSignature(BODY, { id: ID, timestamp: TS, signature: forged }, SECRET)).toBe(false);
  });

  // An unknown version prefix must never be trusted just because the bytes after it match.
  it("ignores signatures under an unknown version prefix", () => {
    const digest = createHmac("sha256", RAW_KEY).update(`${ID}.${TS}.${BODY}`, "utf8").digest("base64");
    const headers = { id: ID, timestamp: TS, signature: `v2,${digest}` };
    expect(verifyBirdSignature(BODY, headers, SECRET)).toBe(false);
  });

  it("rejects missing headers and an unusable secret", () => {
    const sig = sign(ID, TS, BODY);
    expect(verifyBirdSignature(BODY, { id: undefined, timestamp: TS, signature: sig }, SECRET)).toBe(false);
    expect(verifyBirdSignature(BODY, { id: ID, timestamp: undefined, signature: sig }, SECRET)).toBe(false);
    expect(verifyBirdSignature(BODY, { id: ID, timestamp: TS, signature: undefined }, SECRET)).toBe(false);
    expect(verifyBirdSignature(BODY, { id: ID, timestamp: TS, signature: sig }, "whsec_")).toBe(false);
  });
});

describe("isWebhookTimestampFresh", () => {
  const now = 1784500000;

  it("accepts a delivery inside the replay window", () => {
    expect(isWebhookTimestampFresh(String(now), now)).toBe(true);
    expect(isWebhookTimestampFresh(String(now - WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS), now)).toBe(true);
  });

  // A captured delivery stays validly signed forever, so age is the only thing that stops a replay.
  it("rejects a delivery older than the window", () => {
    expect(isWebhookTimestampFresh(String(now - WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS - 1), now)).toBe(false);
  });

  // Symmetric: a far-future stamp would otherwise stay 'fresh' long enough to be replayed at leisure.
  it("rejects a far-future timestamp", () => {
    expect(isWebhookTimestampFresh(String(now + WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS + 1), now)).toBe(false);
  });

  it("fails closed on a missing or non-numeric header", () => {
    expect(isWebhookTimestampFresh(undefined, now)).toBe(false);
    expect(isWebhookTimestampFresh("not-a-number", now)).toBe(false);
  });
});

describe("extractDeliveryFailure", () => {
  it.each([
    ["sms.undelivered", "undelivered"],
    ["sms.failed", "failed"],
    ["sms.rejected", "rejected"],
    ["sms.expired", "expired"],
  ])("reports %s as a delivery failure", (type, status) => {
    const event: BirdSmsEvent = { type, data: { sms_id: "sms_01", error: { code: "E12003" } } };
    expect(extractDeliveryFailure(event)).toEqual({ status, code: "E12003", smsId: "sms_01" });
  });

  // `accepted`/`sent` are progress, and `delivered` is the happy path — counting any of them as a
  // failure would make the metric useless as an alert.
  it.each(["sms.accepted", "sms.sent", "sms.delivered"])("does not treat %s as a failure", (type) => {
    expect(extractDeliveryFailure({ type, data: { sms_id: "sms_01" } })).toBeNull();
  });

  it("falls back to 'unknown' rather than dropping a failure with no error code", () => {
    expect(extractDeliveryFailure({ type: "sms.failed", data: { sms_id: "sms_01" } })).toEqual({
      status: "failed",
      code: "unknown",
      smsId: "sms_01",
    });
  });

  // Best-effort: a shape Bird changes later must degrade, never throw and 500 the webhook.
  it("degrades to null on malformed or unknown events instead of throwing", () => {
    expect(extractDeliveryFailure({} as BirdSmsEvent)).toBeNull();
    expect(extractDeliveryFailure({ type: "sms.something_new" })).toBeNull();
    expect(extractDeliveryFailure({ type: "sms.failed" })).toEqual({
      status: "failed",
      code: "unknown",
      smsId: "unknown",
    });
  });

  // The payload carries `to`, but a phone number must never reach a log line or a metric label.
  it("never surfaces the recipient's phone number", () => {
    const event = { type: "sms.failed", data: { sms_id: "sms_01", to: "+263771234567" } } as BirdSmsEvent;
    expect(JSON.stringify(extractDeliveryFailure(event))).not.toContain("263771234567");
  });
});
