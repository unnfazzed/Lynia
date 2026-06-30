import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { diditTimestampStale, mapDiditStatus, verifyDiditSignature } from "./didit";

describe("mapDiditStatus", () => {
  it("maps Didit statuses to rider kyc_status", () => {
    expect(mapDiditStatus("Approved")).toBe("verified");
    expect(mapDiditStatus("approved")).toBe("verified");
    expect(mapDiditStatus("Declined")).toBe("failed");
    expect(mapDiditStatus("Expired")).toBe("failed");
    expect(mapDiditStatus("In Review")).toBe("pending");
    expect(mapDiditStatus("In Progress")).toBe("pending");
    expect(mapDiditStatus("Not Started")).toBe("pending");
  });
});

describe("verifyDiditSignature", () => {
  const secret = "whsec_test_0123456789";
  const body = JSON.stringify({ session_id: "s_1", status: "Approved" });
  const good = createHmac("sha256", secret).update(body, "utf8").digest("hex");

  it("accepts a valid signature", () => {
    expect(verifyDiditSignature(body, good, secret)).toBe(true);
  });
  it("rejects a tampered body", () => {
    expect(verifyDiditSignature(body + " ", good, secret)).toBe(false);
  });
  it("rejects a wrong/missing signature", () => {
    expect(verifyDiditSignature(body, "deadbeef", secret)).toBe(false);
    expect(verifyDiditSignature(body, undefined, secret)).toBe(false);
  });
});

describe("diditTimestampStale", () => {
  const now = 1_750_000_000_000; // fixed "now" in ms
  const nowSec = now / 1000;

  it("treats a recent timestamp as fresh", () => {
    expect(diditTimestampStale(String(nowSec), now)).toBe(false);
    expect(diditTimestampStale(String(nowSec - 120), now)).toBe(false); // 2 min old, within 5 min
  });
  it("rejects a timestamp outside the tolerance window (replay)", () => {
    expect(diditTimestampStale(String(nowSec - 600), now)).toBe(true); // 10 min old
    expect(diditTimestampStale(String(nowSec + 600), now)).toBe(true); // 10 min in the future
  });
  it("tolerates epoch-millis so a unit change can't reject everything", () => {
    expect(diditTimestampStale(String(now), now)).toBe(false);
  });
  it("fails open on a missing or unparseable timestamp", () => {
    expect(diditTimestampStale(undefined, now)).toBe(false);
    expect(diditTimestampStale("", now)).toBe(false);
    expect(diditTimestampStale("not-a-number", now)).toBe(false);
  });
});
