import { KYC_DECLINE_REASON_LABELS } from "@lynia/shared";
import { ACCOUNT_ON_HOLD_COPY, isAccountOnHold, ONLINE_GATE_COPY, isKycLocked, isOutOfServiceArea, isWithinServiceCorridor, kycDeclineLabel, onlineGateReason, resolveKycRetryFeedback } from "../gates";

describe("onlineGateReason (rider online-gate refusal)", () => {
  it("reads a machine reason code (case-insensitive)", () => {
    expect(onlineGateReason({ code: "on_hold" })).toBe("on_hold");
    expect(onlineGateReason({ code: "SUSPENDED" })).toBe("suspended");
    expect(onlineGateReason({ code: "banned" })).toBe("banned");
    expect(onlineGateReason({ code: "cooldown" })).toBe("cooldown");
    expect(onlineGateReason({ code: "kyc" })).toBe("kyc");
    expect(onlineGateReason({ code: "kyc_expired" })).toBe("kyc_expired");
    expect(onlineGateReason({ code: "out_of_area" })).toBe("out_of_area");
  });

  it("distinguishes a lapsed ID (kyc_expired) from a first-time unverified rider (1·b2)", () => {
    // The expired copy says "re-verify" (contains `verif`) — the sniff must not collapse it into `kyc`.
    expect(onlineGateReason({ message: "Your ID has expired — re-verify to keep riding" })).toBe("kyc_expired");
    expect(onlineGateReason({ code: "kyc_expired", message: "whatever" })).toBe("kyc_expired");
    expect(ONLINE_GATE_COPY.kyc_expired.title).toBeTruthy();
    expect(ONLINE_GATE_COPY.kyc_expired.title).not.toBe(ONLINE_GATE_COPY.kyc.title);
  });

  it("maps a corridor refusal onto the out-of-area gate, incl. aliases + message", () => {
    expect(onlineGateReason({ code: "outside_service_area" })).toBe("out_of_area");
    expect(onlineGateReason({ code: "service_corridor" })).toBe("out_of_area");
    expect(onlineGateReason({ message: "You're outside our service area." })).toBe("out_of_area");
  });

  it("falls back to sniffing the friendly message when no code is tagged", () => {
    expect(onlineGateReason({ message: "Your account is on hold." })).toBe("on_hold");
    expect(onlineGateReason({ message: "This account is suspended." })).toBe("suspended");
    expect(onlineGateReason({ message: "Your account has been banned." })).toBe("banned");
    expect(onlineGateReason({ message: "You're on a cooldown after cancelling." })).toBe("cooldown");
    expect(onlineGateReason({ message: "Finish KYC before going online." })).toBe("kyc");
  });

  it("has calm copy for every gate reason, including out-of-area", () => {
    expect(ONLINE_GATE_COPY.out_of_area.title).toBeTruthy();
    expect(ONLINE_GATE_COPY.out_of_area.message).toContain("service area");
  });

  it("keeps banned distinct from suspended (they are different states)", () => {
    expect(onlineGateReason({ code: "banned" })).not.toBe("suspended");
    expect(ONLINE_GATE_COPY.banned.title).not.toBe(ONLINE_GATE_COPY.suspended.title);
  });

  it("prefers the code over the message", () => {
    expect(onlineGateReason({ code: "on_hold", message: "suspended" })).toBe("on_hold");
    expect(onlineGateReason({ code: "banned", message: "suspended" })).toBe("banned");
  });

  it("returns null for an unrecognised refusal or missing error", () => {
    expect(onlineGateReason({ message: "Couldn't reach the server." })).toBeNull();
    expect(onlineGateReason({ code: "teapot" })).toBeNull();
    expect(onlineGateReason(null)).toBeNull();
    expect(onlineGateReason(undefined)).toBeNull();
  });
});

describe("isAccountOnHold (customer account-on-hold gate, S·2)", () => {
  it("reads the on_hold machine code (the server's create-gate 403)", () => {
    expect(isAccountOnHold({ code: "on_hold" })).toBe(true);
    expect(isAccountOnHold({ code: "account_on_hold" })).toBe(true);
  });
  it("falls back to sniffing the friendly message", () => {
    expect(isAccountOnHold({ message: "Your account is on hold." })).toBe(true);
  });
  it("is false for an unrelated error, and has real copy", () => {
    expect(isAccountOnHold({ code: "out_of_area" })).toBe(false);
    expect(isAccountOnHold({ message: "Couldn't create the order." })).toBe(false);
    expect(isAccountOnHold(null)).toBe(false);
    expect(ACCOUNT_ON_HOLD_COPY.title).toBeTruthy();
    expect(ACCOUNT_ON_HOLD_COPY.message).toBeTruthy();
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

describe("resolveKycRetryFeedback (JOURNEY-BUGS: 'Continue verification' silent no-op)", () => {
  it("opens an https verification URL and clears any prior error", () => {
    expect(resolveKycRetryFeedback("https://verify.didit.me/session/abc", "auto")).toEqual({
      openUrl: "https://verify.didit.me/session/abc",
      error: null,
      info: null,
    });
  });

  it("surfaces an error instead of silently doing nothing when the URL is missing in auto mode", () => {
    const feedback = resolveKycRetryFeedback(undefined, "auto");
    expect(feedback.openUrl).toBeNull();
    expect(feedback.error).toBeTruthy();
    expect(feedback.info).toBeNull();
  });

  it("surfaces an error for a non-https URL rather than opening it", () => {
    const feedback = resolveKycRetryFeedback("http://not-secure.example/session/abc", "auto");
    expect(feedback.openUrl).toBeNull();
    expect(feedback.error).toBeTruthy();
  });

  // BH-03: manual KYC mode never mints a verificationUrl — a missing URL there is the EXPECTED
  // shape of a successful retry (ops review, no vendor step), not a failure to explain as one.
  it("surfaces a calm info line, not an error, when the URL is missing in manual mode", () => {
    const feedback = resolveKycRetryFeedback(undefined, "manual");
    expect(feedback.openUrl).toBeNull();
    expect(feedback.error).toBeNull();
    expect(feedback.info).toBeTruthy();
  });

  it("still opens the URL in manual mode on the rare occasion one is present", () => {
    expect(resolveKycRetryFeedback("https://verify.didit.me/session/xyz", "manual")).toEqual({
      openUrl: "https://verify.didit.me/session/xyz",
      error: null,
      info: null,
    });
  });
});
