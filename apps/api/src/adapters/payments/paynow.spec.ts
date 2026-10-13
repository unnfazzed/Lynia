import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  encodePaynowMessage,
  mapPaynowStatus,
  parsePaynowMessage,
  paynowField,
  paynowHash,
  paynowPhone,
  paynowTrace,
  verifyPaynowMessage,
} from "./paynow";

const KEY = "11111111-2222-3333-4444-555555555555";

describe("Paynow message hash (SHA-512 of the raw values in order + the integration key, uppercase hex)", () => {
  it("matches the documented construction exactly", () => {
    const fields: Array<[string, string]> = [
      ["id", "1201"],
      ["reference", "TEST REF"],
      ["amount", "99.99"],
      ["status", "Message"],
    ];
    const want = createHash("sha512").update(`1201TEST REF99.99Message${KEY}`, "utf8").digest("hex").toUpperCase();
    expect(paynowHash(fields, KEY)).toBe(want);
  });

  it("skips any hash field, and hashes RAW (decoded) values, not the URL-encoded ones", () => {
    const body = encodePaynowMessage([["reference", "a b&c"], ["status", "Ok"]], KEY);
    expect(body).toContain("reference=a+b%26c");
    const parsed = parsePaynowMessage(body);
    expect(paynowField(parsed, "reference")).toBe("a b&c");
    expect(verifyPaynowMessage(parsed, KEY)).toBe(true);
  });

  it("rejects a tampered value, a wrong key and a missing hash", () => {
    const body = encodePaynowMessage([["reference", "t1"], ["amount", "5.00"], ["status", "Paid"]], KEY);
    expect(verifyPaynowMessage(parsePaynowMessage(body.replace("5.00", "50.00")), KEY)).toBe(false);
    expect(verifyPaynowMessage(parsePaynowMessage(body), "another-key-entirely")).toBe(false);
    expect(verifyPaynowMessage(parsePaynowMessage("reference=t1&status=Paid"), KEY)).toBe(false);
  });

  it("reads Paynow's capitalised keys (Status=Error&Error=…) case-insensitively", () => {
    const m = parsePaynowMessage("Status=Error&Error=Insufficient+balance");
    expect(paynowField(m, "status")).toBe("Error");
    expect(paynowField(m, "error")).toBe("Insufficient balance");
  });
});

describe("mapPaynowStatus", () => {
  it.each(["Paid", "Awaiting Delivery", "Delivered", "paid"])("%s → confirmed", (s) => expect(mapPaynowStatus(s)).toBe("confirmed"));
  it.each(["Cancelled", "Failed", "FAILED"])("%s → failed", (s) => expect(mapPaynowStatus(s)).toBe("failed"));
  it.each(["Created", "Sent", "Disputed", "Refunded", "", undefined])("%s → pending (never credited or declined on it)", (s) =>
    expect(mapPaynowStatus(s)).toBe("pending"),
  );
});

describe("paynowPhone (Paynow wants 07XXXXXXXX)", () => {
  it.each(["0771111111", "+263 77 111 1111", "263771111111", "00263771111111", "771111111"])("%s → 0771111111", (raw) =>
    expect(paynowPhone(raw)).toBe("0771111111"),
  );
  it.each(["0242123456", "12345", "", "+27821234567"])("%s → null (not a Zimbabwe mobile)", (raw) => expect(paynowPhone(raw)).toBeNull());
});

describe("paynowTrace", () => {
  it("is our UUID without dashes: 32 chars, Paynow's limit", () => {
    const t = paynowTrace("0b8f1c2e-3d4a-4b5c-8d9e-0f1a2b3c4d5e");
    expect(t).toBe("0b8f1c2e3d4a4b5c8d9e0f1a2b3c4d5e");
    expect(t).toHaveLength(32);
  });
});
