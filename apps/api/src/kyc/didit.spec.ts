import { createHmac } from "node:crypto";
import { KYC_THRESHOLDS } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import {
  canonicalizeDiditBody,
  classifyDiditSession,
  classifyStoredDiditStatus,
  decideDiditKyc,
  diditTimestampFresh,
  extractDiditDocumentExpiry,
  extractDiditDocumentNumber,
  extractDiditScore,
  isDiditReviewHold,
  kycIdExpiryOnLapse,
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

// Startup review 2026-10-06 (R-1 / R-3): the finer class behind kycHeld and retryKyc's dead check.
describe("classifyDiditSession / classifyStoredDiditStatus", () => {
  it("In Review is a hold; Abandoned / Expired / Kyc Expired are dead; separators and case don't matter", () => {
    expect(classifyDiditSession("In Review")).toBe("held");
    expect(classifyDiditSession("IN_REVIEW")).toBe("held");
    expect(classifyDiditSession("Abandoned")).toBe("dead");
    expect(classifyDiditSession("expired")).toBe("dead");
    expect(classifyDiditSession("Kyc Expired")).toBe("dead");
    expect(classifyDiditSession("Resubmitted")).toBe("in_flight");
    expect(classifyDiditSession("Approved")).toBe("in_flight");
    expect(classifyDiditSession("In Progress")).toBe("unfinished");
    expect(classifyDiditSession("Not Started")).toBe("unfinished");
    expect(classifyDiditSession(null)).toBe("unfinished");
    expect(classifyDiditSession("Brand New Status")).toBe("unfinished");
  });

  it("a STORED Approved on a still-pending rider is a hold — that webhook already ran and held it", () => {
    expect(classifyStoredDiditStatus("Approved")).toBe("held");
    expect(classifyStoredDiditStatus("In Review")).toBe("held");
    expect(classifyStoredDiditStatus("Expired")).toBe("dead");
    expect(classifyStoredDiditStatus("In Progress")).toBe("unfinished");
    expect(classifyStoredDiditStatus(null)).toBeNull();
  });
});

describe("mapDiditPendingState", () => {
  it("treats the statuses where the vendor holds the check as in flight", () => {
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
    // Regression: Didit sets "In Progress" as soon as the hosted page opens, before anything is
    // captured. Reading it as in flight told a rider who backed out that their ID was under review.
    expect(mapDiditPendingState("In Progress")).toBe("unfinished");
    expect(mapDiditPendingState("IN_PROGRESS")).toBe("unfinished");
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
  // IR26-07: our Didit destination is V3, which carries the face-match report as a plural array.
  it("reads the V3 webhook shape: decision.face_matches[], normalised from Didit's 0–100 scale", () => {
    // Shape from docs.didit.me/integration/webhooks ("Approved KYC session") — sample data, no real session.
    const v3 = {
      webhook_type: "status.updated",
      session_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      status: "Approved",
      decision: {
        status: "Approved",
        features: ["ID_VERIFICATION", "LIVENESS", "FACE_MATCH"],
        id_verifications: [{ node_id: "id_verification_1", status: "Approved", document_type: "Identity Card" }],
        liveness_checks: [{ node_id: "liveness_1", status: "Approved", method: "ACTIVE_3D", score: 95.4, warnings: [] }],
        face_matches: [{ node_id: "face_match_1", status: "Approved", score: 96.1, warnings: [] }],
      },
    };
    // The face match, not the liveness score beside it.
    expect(extractDiditScore(v3)).toBeCloseTo(0.961, 10);
    // The band edges survive the division exactly.
    expect(extractDiditScore({ decision: { face_matches: [{ score: 85 }] } })).toBe(0.85);
    expect(extractDiditScore({ decision: { face_matches: [{ score: 60 }] } })).toBe(0.6);
    expect(extractDiditScore({ decision: { face_matches: [{ score: 100 }] } })).toBe(1);
    expect(extractDiditScore({ decision: { face_matches: [{ score: 0 }] } })).toBe(0);
  });
  it("takes the scale from the field, not the value: a V3 score of 0.9 is a 0.9% similarity, not 90%", () => {
    const score = extractDiditScore({ decision: { face_matches: [{ score: 0.9 }] } });
    expect(score).toBeCloseTo(0.009, 10);
    // …so a near-zero match lands in the auto-decline band instead of auto-approving.
    expect(decideDiditKyc("Approved", score)).toEqual({ status: "failed", reason: "face_mismatch" });
  });
  it("skips V3 entries with no usable score, and lets the weakest of several face matches decide", () => {
    // The first entry carries no score (null, or absent): the next scored entry is read.
    expect(
      extractDiditScore({ decision: { face_matches: [{ node_id: "fm_1", status: "Declined", score: null }, { node_id: "fm_2", score: 88 }] } }),
    ).toBe(0.88);
    expect(extractDiditScore({ decision: { face_matches: [{ node_id: "fm_1" }, { score: 88 }] } })).toBe(0.88);
    // Two scored nodes: one strong comparison can't cover for a weak one.
    expect(extractDiditScore({ decision: { face_matches: [{ score: 97 }, { score: 41 }] } })).toBe(0.41);
    // Entries that aren't objects are ignored, not crashed on.
    expect(extractDiditScore({ decision: { face_matches: [null, 96, "96", { score: 70 }] } })).toBe(0.7);
  });
  it("ignores a malformed (non-array) face_matches and falls through to the legacy shapes", () => {
    expect(extractDiditScore({ decision: { face_matches: "96.1" } })).toBeNull();
    expect(extractDiditScore({ decision: { face_matches: { score: 96.1 } } })).toBeNull();
    expect(extractDiditScore({ decision: { face_matches: null } })).toBeNull();
    expect(extractDiditScore({ decision: { face_matches: [] } })).toBeNull();
    expect(extractDiditScore({ decision: { face_matches: { score: 96.1 }, face_match: { score: 73 } } })).toBe(0.73);
    expect(extractDiditScore({ decision: { face_matches: [{ score: null }], face_match: { score: 73 } } })).toBe(0.73);
  });
  it("rejects out-of-range and non-numeric V3 scores without masking a valid one", () => {
    for (const bad of [150, 100.01, -5, -0.01, Number.NaN, Number.POSITIVE_INFINITY, "96.1", true]) {
      expect(extractDiditScore({ decision: { face_matches: [{ score: bad }] } })).toBeNull();
    }
    expect(extractDiditScore({ decision: { face_matches: [{ score: 150 }, { score: 72 }] } })).toBe(0.72);
  });
  it("prefers the V3 face match over the legacy shapes when both are present", () => {
    expect(extractDiditScore({ score: 0.99, decision: { score: 0.99, face_matches: [{ score: 41 }] } })).toBe(0.41);
  });
  it("reads a top-level score / confidence", () => {
    expect(extractDiditScore({ score: 0.91 })).toBe(0.91);
    expect(extractDiditScore({ confidence: 0.4 })).toBe(0.4);
  });
  it("reads the V2 singular decision.face_match score on the same 0–100 scale, and the legacy probes on [0, 1]", () => {
    expect(extractDiditScore({ decision: { face_match: { score: 73 } } })).toBe(0.73);
    // Regression: the old [0, 1] reading took a 0.9% similarity as 0.9 — inside the auto-approve band.
    expect(extractDiditScore({ decision: { face_match: { score: 0.9 } } })).toBeCloseTo(0.009, 10);
    expect(extractDiditScore({ decision: { face_match: { score: 101 } } })).toBeNull();
    expect(extractDiditScore({ decision: { face_match: { confidence: 0.66 } } })).toBe(0.66);
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
  it("reads the V3 webhook shape: decision.id_verifications[] (Didit's default, and our destination's version)", () => {
    // Shape from docs.didit.me/integration/webhooks (V3: every per-feature result is a plural array).
    const v3 = {
      webhook_type: "status.updated",
      status: "Approved",
      decision: {
        id_verifications: [
          { node_id: "feature_ocr", status: "Approved", document_type: "Identity Card", document_number: "63-123456-A-42", first_name: "Jane", last_name: "Doe" },
        ],
      },
    };
    expect(extractDiditDocumentNumber(v3)).toBe("63-123456-A-42");
    // personal_number when the entry has no document number; a later entry when the first carries none.
    expect(extractDiditDocumentNumber({ decision: { id_verifications: [{ personal_number: "63123456A42" }] } })).toBe("63123456A42");
    expect(
      extractDiditDocumentNumber({ decision: { id_verifications: [{ status: "Declined" }, { document_number: "63-222222-B-22" }] } }),
    ).toBe("63-222222-B-22");
    // A passport carries both: the passport number as document_number and the national ID as
    // personal_number. The national ID wins — it is what the one-ID-one-account dedupe compares.
    expect(
      extractDiditDocumentNumber({ decision: { id_verifications: [{ document_type: "Passport", document_number: "FN123456", personal_number: "63-123456-A-42" }] } }),
    ).toBe("63-123456-A-42");
    expect(
      extractDiditDocumentNumber({ decision: { id_verification: { document_number: "FN123456", personal_number: "63-123456-A-42" } } }),
    ).toBe("63-123456-A-42");
    // A V3 payload whose array carries no number fails open, exactly like the singular shapes.
    expect(extractDiditDocumentNumber({ decision: { id_verifications: [{ status: "Approved" }] } })).toBeNull();
    expect(extractDiditDocumentNumber({ decision: { id_verifications: "not-an-array" } })).toBeNull();
  });
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
  it("score >= autoApprove on a Didit approval → verified", () => {
    expect(decideDiditKyc("Approved", KYC_THRESHOLDS.autoApprove)).toEqual({ status: "verified" });
    expect(decideDiditKyc("Approved", 0.99)).toEqual({ status: "verified" });
  });

  // IR26-07: the score is ONE feature (the face match); Didit's status covers the rest — document validity,
  // liveness, AML. These paths were dead while V3 extraction returned null; now they are live.
  it("never lets a passing face match override a Didit decline, review or unfinished session", () => {
    // A spoof that fails liveness can still match the document's face.
    expect(decideDiditKyc("Declined", 0.99)).toEqual({ status: "failed" });
    expect(decideDiditKyc("Declined", 0.7)).toEqual({ status: "failed" });
    // Didit flagged it for a human: a strong face match doesn't clear warnings it didn't raise.
    expect(decideDiditKyc("In Review", 0.99)).toEqual({ status: "pending" });
    expect(decideDiditKyc("IN_REVIEW", 0.99)).toEqual({ status: "pending" });
    // Abandoned carries a partial decision; it is not a verdict.
    expect(decideDiditKyc("Abandoned", 0.99)).toEqual({ status: "pending" });
    expect(decideDiditKyc("In Progress", 0.99)).toEqual({ status: "pending" });
    expect(decideDiditKyc("Kyc Expired", 0.99)).toEqual({ status: "expired" });
  });

  it("never auto-declines a session Didit didn't finish judging on a partial low score", () => {
    // e.g. a dark first selfie, then the rider gave up mid-retry: no verdict, so no burnt attempt.
    expect(decideDiditKyc("Abandoned", 0.3)).toEqual({ status: "pending" });
    expect(decideDiditKyc("Expired", 0.3)).toEqual({ status: "pending" });
    expect(decideDiditKyc("Kyc Expired", 0.3)).toEqual({ status: "expired" });
  });

  it("gives a Didit decline the face-mismatch reason when its face match is below needsReview", () => {
    expect(decideDiditKyc("Declined", 0.32)).toEqual({ status: "failed", reason: "face_mismatch" });
  });

  it("property: no score ever yields `verified` unless Didit approved, nor softens a Didit decline", () => {
    const statuses = ["Approved", "Declined", "In Review", "IN_REVIEW", "Abandoned", "Expired", "Kyc Expired", "In Progress", "Not Started", "Awaiting User", "Resubmitted", "Something New"];
    for (const s of statuses) {
      for (let pct = 0; pct <= 100; pct++) {
        const d = decideDiditKyc(s, pct / 100);
        if (d.status === "verified") expect(mapDiditStatus(s)).toBe("verified");
        if (mapDiditStatus(s) === "failed") expect(d.status).toBe("failed");
      }
    }
  });

  // End to end over the V3 shape (sample data, as above). Didit's own face-match decline threshold
  // defaults to 30/100, so it approves the 72 and the 45 below — our bands are what catch them.
  it("bands a V3-shaped webhook: a Didit approval with a weak face match is held or declined", () => {
    const v3 = (status: string, score: number) => ({
      status,
      decision: { status, face_matches: [{ node_id: "face_match_1", status, score, warnings: [] }] },
    });
    const decide = (p: { status: string }) => decideDiditKyc(p.status, extractDiditScore(p));
    expect(decide(v3("Approved", 96.1))).toEqual({ status: "verified" });
    expect(decide(v3("Approved", 72))).toEqual({ status: "pending" });
    expect(decide(v3("Approved", 45))).toEqual({ status: "failed", reason: "face_mismatch" });
    expect(decide(v3("Declined", 32))).toEqual({ status: "failed", reason: "face_mismatch" });
    expect(decide(v3("Declined", 97))).toEqual({ status: "failed" });
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

// D-75 item 2 (IR26-09): which held results store their document number. Only a result Didit JUDGED and
// we hold for a human: In Review, or an approval in the face-match review band.
describe("isDiditReviewHold", () => {
  it("a Didit approval held in the face-match review band is a review hold", () => {
    expect(isDiditReviewHold("Approved", 0.72)).toBe(true);
    expect(isDiditReviewHold("Approved", KYC_THRESHOLDS.needsReview)).toBe(true);
  });

  it("Didit's In Review is a review hold, with or without a score, however it's spelled", () => {
    expect(isDiditReviewHold("In Review", null)).toBe(true);
    expect(isDiditReviewHold("In Review", 0.99)).toBe(true);
    expect(isDiditReviewHold("IN_REVIEW", 0.7)).toBe(true);
    expect(isDiditReviewHold("in-review", null)).toBe(true);
  });

  it("a result the webhook applies is not a hold: verified, declined, auto-declined or expired", () => {
    expect(isDiditReviewHold("Approved", 0.96)).toBe(false);
    expect(isDiditReviewHold("Approved", null)).toBe(false);
    expect(isDiditReviewHold("Approved", 0.45)).toBe(false);
    expect(isDiditReviewHold("In Review", 0.3)).toBe(false);
    expect(isDiditReviewHold("Declined", 0.99)).toBe(false);
    expect(isDiditReviewHold("Kyc Expired", null)).toBe(false);
  });

  it("a session Didit never finished judging is not a hold, whatever partial score it carries", () => {
    for (const s of ["Abandoned", "Expired", "In Progress", "Not Started", "Awaiting User", "Resubmitted", "Something New"]) {
      expect(isDiditReviewHold(s, null)).toBe(false);
      expect(isDiditReviewHold(s, 0.99)).toBe(false);
    }
  });

  it("property: a review hold is always a `pending` decision on an Approved or In Review result", () => {
    const statuses = ["Approved", "Declined", "In Review", "IN_REVIEW", "Abandoned", "Expired", "Kyc Expired", "In Progress", "Not Started", "Awaiting User", "Resubmitted", "Something New"];
    for (const s of statuses) {
      for (const score of [null, ...Array.from({ length: 101 }, (_, pct) => pct / 100)]) {
        if (!isDiditReviewHold(s, score)) continue;
        expect(decideDiditKyc(s, score).status).toBe("pending");
        expect(["Approved", "In Review", "IN_REVIEW"]).toContain(s);
      }
    }
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

// First Run v2 F6 (ledger D-82 §4): "Expired 2 Oct 2026" — the verified document's expiry day.
describe("extractDiditDocumentExpiry", () => {
  it("reads expiration_date off a V3 id_verifications[] entry as a UTC day", () => {
    const d = extractDiditDocumentExpiry({ decision: { id_verifications: [{ document_number: "63-123456A78", expiration_date: "2026-10-02" }] } });
    expect(d?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
  });

  it("reads the v2 singular object and the kyc alias too", () => {
    expect(extractDiditDocumentExpiry({ decision: { id_verification: { expiration_date: "2030-01-31" } } })?.toISOString()).toBe("2030-01-31T00:00:00.000Z");
    expect(extractDiditDocumentExpiry({ decision: { kyc: { date_of_expiry: "2029-12-01" } } })?.toISOString()).toBe("2029-12-01T00:00:00.000Z");
  });

  it("fails open to null: no field, a malformed one, or an impossible date", () => {
    expect(extractDiditDocumentExpiry(null)).toBeNull();
    expect(extractDiditDocumentExpiry({ decision: {} })).toBeNull();
    expect(extractDiditDocumentExpiry({ decision: { id_verifications: [{ expiration_date: "02/10/2026" }] } })).toBeNull();
    expect(extractDiditDocumentExpiry({ decision: { id_verifications: [{ expiration_date: "2026-02-31" }] } })).toBeNull();
    expect(extractDiditDocumentExpiry({ decision: { id_verifications: [{ expiration_date: 20261002 }] } })).toBeNull();
  });
});

describe("kycIdExpiryOnLapse", () => {
  const event = new Date("2026-10-05T14:30:00Z");
  it("keeps the document's own expiry day when it is on or before the lapse", () => {
    const stored = new Date("2026-10-02T00:00:00Z");
    expect(kycIdExpiryOnLapse(stored, event)).toBe(stored);
  });
  it("otherwise (unknown, or a later stored day) stamps the day the expiry was applied", () => {
    expect(kycIdExpiryOnLapse(null, event).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(kycIdExpiryOnLapse(new Date("2031-01-01T00:00:00Z"), event).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });
});
