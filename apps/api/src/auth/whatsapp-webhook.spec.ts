import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractFailedDeliveryReasons, verifyMetaSignature, type WhatsappStatusPayload } from "./whatsapp-webhook";

describe("verifyMetaSignature", () => {
  const secret = "app_secret_test_0123456789";
  const body = JSON.stringify({ entry: [] });
  const hex = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  const good = `sha256=${hex}`;

  it("accepts a valid signature", () => {
    expect(verifyMetaSignature(body, good, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyMetaSignature(`${body} `, good, secret)).toBe(false);
  });

  it("rejects a wrong signature", () => {
    expect(verifyMetaSignature(body, `sha256=${"0".repeat(64)}`, secret)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
  });

  it("rejects a signature without the sha256= prefix", () => {
    expect(verifyMetaSignature(body, hex, secret)).toBe(false);
  });

  it("rejects the correct hex signed with the WRONG secret", () => {
    const wrongHex = createHmac("sha256", "a-different-secret").update(body, "utf8").digest("hex");
    expect(verifyMetaSignature(body, `sha256=${wrongHex}`, secret)).toBe(false);
  });
});

describe("extractFailedDeliveryReasons", () => {
  it("extracts the error title for each failed status entry", () => {
    const payload: WhatsappStatusPayload = {
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  { status: "sent" },
                  { status: "delivered" },
                  { status: "failed", errors: [{ title: "Message Undeliverable" }] },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(extractFailedDeliveryReasons(payload)).toEqual(["Message Undeliverable"]);
  });

  it("falls back to the literal 'failed' when no error title is present", () => {
    const payload: WhatsappStatusPayload = {
      entry: [{ changes: [{ value: { statuses: [{ status: "failed" }] } }] }],
    };
    expect(extractFailedDeliveryReasons(payload)).toEqual(["failed"]);
  });

  it("flattens across multiple entries/changes/statuses", () => {
    const payload: WhatsappStatusPayload = {
      entry: [
        { changes: [{ value: { statuses: [{ status: "failed", errors: [{ title: "A" }] }] } }] },
        {
          changes: [
            { value: { statuses: [{ status: "delivered" }] } },
            { value: { statuses: [{ status: "failed", errors: [{ title: "B" }] }] } },
          ],
        },
      ],
    };
    expect(extractFailedDeliveryReasons(payload)).toEqual(["A", "B"]);
  });

  it("returns an empty list for no failures, and degrades safely on a malformed/empty shape", () => {
    expect(extractFailedDeliveryReasons({ entry: [{ changes: [{ value: { statuses: [{ status: "sent" }] } }] }] })).toEqual([]);
    expect(extractFailedDeliveryReasons({})).toEqual([]);
    expect(extractFailedDeliveryReasons({ entry: [{}] })).toEqual([]);
    expect(extractFailedDeliveryReasons({ entry: [{ changes: [{}] }] })).toEqual([]);
  });
});
