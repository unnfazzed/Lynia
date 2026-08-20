import { createHmac } from "node:crypto";
import { KYC_THRESHOLDS } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import {
  canonicalizeDiditBody,
  decideDiditKyc,
  diditTimestampFresh,
  extractDiditDocumentNumber,
  extractDiditScore,
  mapDiditPendingState,
  mapDiditStatus,
  verifyDiditSignature,
  verifyDiditSignatureV2,
} from "./didit";

describe("mapDiditStatus", () => {
  it("maps Didit statuses to rider kyc_status", () => {
    expect(mapDiditStatus("Approved")).toBe("verified");
    expect(mapDiditStatus("approved")).toBe("verified");
    expect(mapDiditStatus("Declined")).toBe("failed");
    // A previously-verified ID that later lapsed → its own `expired` state (1·b2), not a decline.
    expect(mapDiditStatus("Kyc Expired")).toBe("expired");
    expect(mapDiditStatus("kyc expired")).toBe("expired");
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

describe("mapDiditPendingState", () => {
  it("treats the statuses where the vendor holds the check as in flight", () => {
    expect(mapDiditPendingState("In Progress")).toBe("in_flight");
    expect(mapDiditPendingState("In Review")).toBe("in_flight");
    expect(mapDiditPendingState("Resubmitted")).toBe("in_flight");
  });

  // A terminal decision the webhook hasn't delivered yet. The row still says pending, and the honest
  // read of "with Didit, nothing for you to do" is in_flight — showing "Finish verifying" to a rider
  // who is seconds from being verified would be worse than one wasted poll.
  it("treats an already-decided session as in flight, not as the rider's move", () => {
    expect(mapDiditPendingState("Approved")).toBe("in_flight");
    expect(mapDiditPendingState("Declined")).toBe("in_flight");
  });

  it("treats never-opened and backed-out sessions as unfinished", () => {
    expect(mapDiditPendingState("Not Started")).toBe("unfinished");
    expect(mapDiditPendingState("Awaiting User")).toBe("unfinished");
  });

  // Dead sessions land on `unfinished` too: the rider owes the next tap either way — the only
  // difference is that resuming mints a fresh session rather than reusing the live one.
  it("treats dead sessions as unfinished", () => {
    expect(mapDiditPendingState("Abandoned")).toBe("unfinished");
    expect(mapDiditPendingState("Expired")).toBe("unfinished");
    expect(mapDiditPendingState("Kyc Expired")).toBe("unfinished");
  });

  // The regression this normalisation exists for: Didit has shipped all three spellings, and a
  // casing/separator change must not silently reclassify every in-flight rider as "your move".
  it("survives casing and separator drift in the status string", () => {
    for (const s of ["IN_REVIEW", "in-review", "in review", "  In   Review  ", "In_Review"]) {
      expect(mapDiditPendingState(s)).toBe("in_flight");
    }
  });

  it("defaults an unknown status to unfinished rather than guessing in flight", () => {
    expect(mapDiditPendingState("Something New")).toBe("unfinished");
    expect(mapDiditPendingState("")).toBe("unfinished");
  });
});

describe("extractDiditScore", () => {
  it("reads a top-level score / confidence", () => {
    expect(extractDiditScore({ score: 0.91 })).toBe(0.91);
    expect(extractDiditScore({ confidence: 0.4 })).toBe(0.4);
  });
  it("reads a nested decision.face_match score", () => {
    expect(extractDiditScore({ decision: { face_match: { score: 0.73 } } })).toBe(0.73);
    expect(extractDiditScore({ decision: { score: 0.5 } })).toBe(0.5);
  });
  it("returns null when there is no score, or it is out of [0,1] / non-numeric", () => {
    expect(extractDiditScore({ status: "Approved" })).toBeNull();
    expect(extractDiditScore({ score: 1.4 })).toBeNull();
    expect(extractDiditScore({ score: "0.9" })).toBeNull();
    expect(extractDiditScore(null)).toBeNull();
  });
});

describe("extractDiditDocumentNumber (IR26-04 vendor-document dedupe)", () => {
  it("reads the per-feature id_verification document/personal number", () => {
    expect(extractDiditDocumentNumber({ decision: { id_verification: { document_number: "63-123456-A-42" } } })).toBe(
      "63-123456-A-42",
    );
    expect(extractDiditDocumentNumber({ decision: { id_verification: { personal_number: "63123456A42" } } })).toBe(
      "63123456A42",
    );
  });
  it("reads the kyc-feature alias and the top-level fallback", () => {
    expect(extractDiditDocumentNumber({ decision: { kyc: { document_number: "63-123456-A-42" } } })).toBe("63-123456-A-42");
    expect(extractDiditDocumentNumber({ document_number: "63-123456-A-42" })).toBe("63-123456-A-42");
  });
  it("prefers id_verification over the kyc alias when both are present, and trims whitespace", () => {
    const payload = {
      decision: { id_verification: { document_number: " 63-111111-A-11 " }, kyc: { document_number: "63-222222-B-22" } },
    };
    expect(extractDiditDocumentNumber(payload)).toBe("63-111111-A-11");
  });
  it("fails open to null on junk: missing, non-string, out-of-bounds length, or digit-free values", () => {
    expect(extractDiditDocumentNumber({ status: "Approved" })).toBeNull();
    expect(extractDiditDocumentNumber(null)).toBeNull();
    expect(extractDiditDocumentNumber({ decision: { id_verification: { document_number: 12345 } } })).toBeNull();
    expect(extractDiditDocumentNumber({ decision: { id_verification: { document_number: "123" } } })).toBeNull(); // < 4 chars
    expect(extractDiditDocumentNumber({ decision: { id_verification: { document_number: "x".repeat(41) } } })).toBeNull();
    expect(extractDiditDocumentNumber({ decision: { id_verification: { document_number: "NO-DIGITS-HERE" } } })).toBeNull();
    // A junk primary must not mask a valid fallback further down the probe order.
    expect(
      extractDiditDocumentNumber({ decision: { id_verification: { document_number: "123" }, kyc: { document_number: "63-123456-A-42" } } }),
    ).toBe("63-123456-A-42");
  });
});

describe("decideDiditKyc (Didit auto-decision bands, KYC_THRESHOLDS)", () => {
  it("score >= autoApprove → verified", () => {
    expect(decideDiditKyc("Approved", KYC_THRESHOLDS.autoApprove)).toEqual({ status: "verified" });
    expect(decideDiditKyc("In Review", 0.99)).toEqual({ status: "verified" });
  });

  it("[needsReview, autoApprove) → pending (human review, never auto-verified)", () => {
    expect(decideDiditKyc("In Review", KYC_THRESHOLDS.needsReview)).toEqual({ status: "pending" });
    expect(decideDiditKyc("Approved", 0.7)).toEqual({ status: "pending" });
  });

  it("score < needsReview → failed (auto-decline) with a reason", () => {
    const d = decideDiditKyc("In Review", 0.3);
    expect(d.status).toBe("failed");
    expect(d.reason).toBe("face_mismatch"); // canonical KycDeclineReason key, resolved to copy by the app
  });

  it("no score → falls back to the status-string mapping", () => {
    expect(decideDiditKyc("Approved", null)).toEqual({ status: "verified" });
    expect(decideDiditKyc("Declined", null)).toEqual({ status: "failed" });
    expect(decideDiditKyc("In Review", null)).toEqual({ status: "pending" });
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
