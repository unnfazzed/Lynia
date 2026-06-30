import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalizeDiditBody,
  diditTimestampFresh,
  mapDiditStatus,
  verifyDiditSignature,
  verifyDiditSignatureV2,
} from "./didit";

describe("mapDiditStatus", () => {
  it("maps Didit statuses to rider kyc_status", () => {
    expect(mapDiditStatus("Approved")).toBe("verified");
    expect(mapDiditStatus("approved")).toBe("verified");
    expect(mapDiditStatus("Declined")).toBe("failed");
    expect(mapDiditStatus("Kyc Expired")).toBe("failed");
    // session "Expired" = the hosted URL aged out before completion → retryable, not a rejection
    expect(mapDiditStatus("Expired")).toBe("pending");
    expect(mapDiditStatus("In Review")).toBe("pending");
    expect(mapDiditStatus("In Progress")).toBe("pending");
    expect(mapDiditStatus("Awaiting User")).toBe("pending");
    expect(mapDiditStatus("Resubmitted")).toBe("pending");
    expect(mapDiditStatus("Abandoned")).toBe("pending");
    expect(mapDiditStatus("Not Started")).toBe("pending");
  });
});

describe("canonicalizeDiditBody", () => {
  it("sorts keys recursively (array order preserved)", () => {
    const raw = JSON.stringify({ status: "Approved", session_id: "s", decision: { z: 1, a: [3, 1] } });
    expect(canonicalizeDiditBody(raw)).toBe('{"decision":{"a":[3,1],"z":1},"session_id":"s","status":"Approved"}');
  });
});

describe("verifyDiditSignatureV2", () => {
  const secret = "whsec_test_0123456789";
  // Body whose key order differs from canonical, to prove canonicalisation is load-bearing.
  const body = JSON.stringify({ status: "Approved", session_id: "s_1" });
  const good = createHmac("sha256", secret).update(canonicalizeDiditBody(body), "utf8").digest("hex");

  it("accepts a signature over the canonical body even when key order differs", () => {
    expect(verifyDiditSignatureV2(body, good, secret)).toBe(true);
  });
  it("rejects a tampered body", () => {
    const tampered = JSON.stringify({ status: "Declined", session_id: "s_1" });
    expect(verifyDiditSignatureV2(tampered, good, secret)).toBe(false);
  });
  it("rejects a wrong/missing signature and non-JSON bodies", () => {
    expect(verifyDiditSignatureV2(body, "deadbeef", secret)).toBe(false);
    expect(verifyDiditSignatureV2(body, undefined, secret)).toBe(false);
    expect(verifyDiditSignatureV2("not-json", good, secret)).toBe(false);
  });
});

describe("verifyDiditSignature (legacy raw-bytes fallback)", () => {
  const secret = "whsec_test_0123456789";
  const body = JSON.stringify({ session_id: "s_1", status: "Approved" });
  const good = createHmac("sha256", secret).update(body, "utf8").digest("hex");

  it("accepts a valid signature", () => {
    expect(verifyDiditSignature(body, good, secret)).toBe(true);
  });
  it("rejects a tampered body / wrong / missing signature", () => {
    expect(verifyDiditSignature(`${body} `, good, secret)).toBe(false);
    expect(verifyDiditSignature(body, "deadbeef", secret)).toBe(false);
    expect(verifyDiditSignature(body, undefined, secret)).toBe(false);
  });
});

describe("diditTimestampFresh", () => {
  const now = 1_750_000_000_000; // fixed "now" in ms
  const nowSec = now / 1000;

  it("accepts a recent timestamp", () => {
    expect(diditTimestampFresh(String(nowSec), now)).toBe(true);
    expect(diditTimestampFresh(String(nowSec - 120), now)).toBe(true); // 2 min old, within 5 min
  });
  it("rejects a timestamp outside the 300s window (replay)", () => {
    expect(diditTimestampFresh(String(nowSec - 600), now)).toBe(false); // 10 min old
    expect(diditTimestampFresh(String(nowSec + 600), now)).toBe(false); // 10 min in the future
  });
  it("tolerates epoch-millis so a unit change can't reject everything", () => {
    expect(diditTimestampFresh(String(now), now)).toBe(true);
  });
  it("fails closed on a missing or unparseable timestamp", () => {
    expect(diditTimestampFresh(undefined, now)).toBe(false);
    expect(diditTimestampFresh("", now)).toBe(false);
    expect(diditTimestampFresh("not-a-number", now)).toBe(false);
  });
});
