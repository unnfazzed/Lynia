import { describe, expect, it } from "vitest";
import { KYC_DECLINE_CLASS, KYC_DECLINE_REASON_LABELS, KycDeclineReason, kycDeclineClass } from "./enums";

// KYC-R26-13: which automatic declines cost the rider a strike against the A-02 lock.
describe("KYC_DECLINE_CLASS (KYC-R26-13)", () => {
  it("classifies every decline reason, and labels every one", () => {
    for (const r of Object.values(KycDeclineReason)) {
      expect(["fixable", "strike", "final"]).toContain(KYC_DECLINE_CLASS[r]);
      expect(KYC_DECLINE_REASON_LABELS[r]).toBeTruthy();
    }
  });

  it("honest mistakes are fixable, identity evidence is a strike, under age is final", () => {
    for (const r of ["id_unreadable", "face_mismatch", "id_expired", "other"]) expect(kycDeclineClass(r)).toBe("fixable");
    for (const r of ["doc_tampered", "liveness_failed", "duplicate", "id_mismatch"]) expect(kycDeclineClass(r)).toBe("strike");
  });

  it("a signup name that doesn't match the ID is fixable — corrected in Personal details, then retried (owner 2026-10-15)", () => {
    expect(kycDeclineClass("name_mismatch")).toBe("fixable");
  });

  it("under age stays final", () => {
    expect(kycDeclineClass("underage")).toBe("final");
    expect(KYC_DECLINE_REASON_LABELS.underage).toBe("You must be 18 or older to ride");
  });

  it("an unexplained or unknown reason never costs a strike", () => {
    expect(kycDeclineClass(null)).toBe("fixable");
    expect(kycDeclineClass(undefined)).toBe("fixable");
    expect(kycDeclineClass("")).toBe("fixable");
    expect(kycDeclineClass("a-reason-a-newer-server-added")).toBe("fixable");
    // Not an own key of the map, though it is on every object's prototype.
    expect(kycDeclineClass("toString")).toBe("fixable");
  });
});
