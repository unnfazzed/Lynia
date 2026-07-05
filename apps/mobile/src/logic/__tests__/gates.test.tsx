import { KYC_DECLINE_REASON_LABELS } from "@lynia/shared";
import { isKycLocked, isOutOfServiceArea, isWithinServiceCorridor, kycDeclineLabel, onlineGateReason } from "../gates";

describe("onlineGateReason (rider online-gate refusal)", () => {
  it("reads a machine reason code (case-insensitive)", () => {
    expect(onlineGateReason({ code: "on_hold" })).toBe("on_hold");
    expect(onlineGateReason({ code: "SUSPENDED" })).toBe("suspended");
    expect(onlineGateReason({ code: "cooldown" })).toBe("cooldown");
    expect(onlineGateReason({ code: "kyc" })).toBe("kyc");
  });

  it("falls back to sniffing the friendly message when no code is tagged", () => {
    expect(onlineGateReason({ message: "Your account is on hold." })).toBe("on_hold");
    expect(onlineGateReason({ message: "This account is suspended." })).toBe("suspended");
    expect(onlineGateReason({ message: "You're on a cooldown after cancelling." })).toBe("cooldown");
    expect(onlineGateReason({ message: "Finish KYC before going online." })).toBe("kyc");
  });

  it("prefers the code over the message", () => {
    expect(onlineGateReason({ code: "on_hold", message: "suspended" })).toBe("on_hold");
  });

  it("returns null for an unrecognised refusal or missing error", () => {
    expect(onlineGateReason({ message: "Couldn't reach the server." })).toBeNull();
    expect(onlineGateReason({ code: "teapot" })).toBeNull();
    expect(onlineGateReason(null)).toBeNull();
    expect(onlineGateReason(undefined)).toBeNull();
  });
});

describe("kycDeclineLabel + isKycLocked (item 4)", () => {
  it("maps a canonical reason to its shared label", () => {
    expect(kycDeclineLabel("id_expired")).toBe(KYC_DECLINE_REASON_LABELS.id_expired);
    expect(kycDeclineLabel("face_mismatch")).toBe(KYC_DECLINE_REASON_LABELS.face_mismatch);
  });

  it("returns null for a missing or unknown reason", () => {
    expect(kycDeclineLabel(null)).toBeNull();
    expect(kycDeclineLabel(undefined)).toBeNull();
    expect(kycDeclineLabel("not_a_reason")).toBeNull();
  });

  it("locks self-resubmit at 2+ attempts, not before", () => {
    expect(isKycLocked(0)).toBe(false);
    expect(isKycLocked(1)).toBe(false);
    expect(isKycLocked(2)).toBe(true);
    expect(isKycLocked(3)).toBe(true);
    expect(isKycLocked(undefined)).toBe(false);
  });
});

describe("service-corridor gate (Q1)", () => {
  it("detects the out-of-area error by code or message", () => {
    expect(isOutOfServiceArea({ code: "out_of_area" })).toBe(true);
    expect(isOutOfServiceArea({ code: "service_corridor" })).toBe(true);
    expect(isOutOfServiceArea({ message: "That drop-off is outside our service area." })).toBe(true);
  });

  it("does not mistake an unrelated 4xx for out-of-area", () => {
    expect(isOutOfServiceArea({ code: "validation_error", message: "Price is required." })).toBe(false);
    expect(isOutOfServiceArea(null)).toBe(false);
  });

  it("pre-check: a Harare point is inside, a far point is outside", () => {
    // Harare CBD ≈ the corridor centre → inside.
    expect(isWithinServiceCorridor({ lat: -17.8292, lng: 31.0522 })).toBe(true);
    // Bulawayo (~370km away) → outside the 25km disc.
    expect(isWithinServiceCorridor({ lat: -20.15, lng: 28.58 })).toBe(false);
  });
});
