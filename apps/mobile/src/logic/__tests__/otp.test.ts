import { RESEND_COOLDOWN_S, formatCountdown, isOtpExpiredOrLocked } from "../otp";

describe("resend cooldown window", () => {
  it("throttles a resend for a full minute (design: 60s)", () => {
    expect(RESEND_COOLDOWN_S).toBe(60);
  });
});

describe("formatCountdown", () => {
  it("renders m:ss, zero-padding the seconds", () => {
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(42)).toBe("0:42");
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(65)).toBe("1:05");
  });

  it("floors fractional seconds and never goes negative", () => {
    expect(formatCountdown(9.9)).toBe("0:09");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

describe("isOtpExpiredOrLocked", () => {
  it("recognises the API's expired + lockout messages (401)", () => {
    // Exact strings the server throws (apps/api/src/auth/auth.service.ts).
    expect(isOtpExpiredOrLocked({ status: 401, message: "Code expired or never requested" })).toBe(true);
    expect(isOtpExpiredOrLocked({ status: 401, message: "Too many attempts — request a new code" })).toBe(true);
  });

  it("does not treat a plain wrong code as needing a fresh one", () => {
    // "Invalid code" still has attempts left — the user just retypes, no fresh-code recovery.
    expect(isOtpExpiredOrLocked({ status: 401, message: "Invalid code" })).toBe(false);
  });

  it("ignores non-401 failures and missing errors", () => {
    expect(isOtpExpiredOrLocked({ status: 429, message: "Too many attempts" })).toBe(false);
    expect(isOtpExpiredOrLocked({ status: 500, message: "Server error" })).toBe(false);
    expect(isOtpExpiredOrLocked(null)).toBe(false);
    expect(isOtpExpiredOrLocked(undefined)).toBe(false);
  });
});
