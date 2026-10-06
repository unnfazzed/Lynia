import { RESEND_COOLDOWN_S, formatCountdown, formatWait, isOtpExpiredOrLocked, otpErrorMessage, otpFailure } from "../otp";

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

// C-9 (start-up review 2026-10-06): the API now tags each OTP failure with a reason code; the client
// reads the code first and keeps the message-matching only for servers released before it.
describe("otpFailure", () => {
  it("reads the API's reason codes, whatever the message says", () => {
    expect(otpFailure({ status: 401, code: "otp_invalid", message: "anything" })).toBe("invalid");
    expect(otpFailure({ status: 401, code: "otp_expired", message: "Invalid code" })).toBe("expired");
    expect(otpFailure({ status: 401, code: "otp_locked", message: "Invalid code" })).toBe("locked");
  });

  it("falls back to the words for an untagged 401 from an older server", () => {
    expect(otpFailure({ status: 401, message: "Invalid code" })).toBe("invalid");
    expect(otpFailure({ status: 401, message: "Code expired or never requested" })).toBe("expired");
    expect(otpFailure({ status: 401, message: "Too many attempts — request a new code" })).toBe("locked");
  });

  it("is a non-answer for anything that didn't judge the code", () => {
    expect(otpFailure({ status: 0, message: "Can't reach LyniaGo" })).toBeNull();
    expect(otpFailure({ status: 500, message: "Internal server error" })).toBeNull();
    expect(otpFailure({ status: 429, code: "device_signup_cap", retryAfter: 600 })).toBeNull();
    // A 400 is a malformed request (no device id, a bad number) — never "that code isn't right".
    expect(otpFailure({ status: 400, message: "A device id is required to create an account." })).toBeNull();
    expect(otpFailure({ status: 422, message: "Validation failed" })).toBeNull();
    expect(otpFailure(null)).toBeNull();
  });

  it("isOtpExpiredOrLocked prefers the code too", () => {
    expect(isOtpExpiredOrLocked({ status: 401, code: "otp_expired", message: "x" })).toBe(true);
    expect(isOtpExpiredOrLocked({ status: 401, code: "otp_invalid", message: "Code expired" })).toBe(false);
  });
});

describe("formatWait / otpErrorMessage", () => {
  it("rounds a wait up to whole minutes, then whole hours", () => {
    expect(formatWait(5)).toBe("1 min");
    expect(formatWait(60)).toBe("1 min");
    expect(formatWait(61)).toBe("2 min");
    expect(formatWait(55 * 60)).toBe("55 min");
    expect(formatWait(3600)).toBe("1 h");
    expect(formatWait(86_000)).toBe("24 h");
  });

  it("names the wait on a 429 that carries retryAfter", () => {
    expect(otpErrorMessage({ status: 429, message: "Too many requests — try again later", retryAfter: 1200 }, "x")).toBe("Too many tries. Try again in 20 min.");
  });

  it("otherwise shows the API's message, or the fallback for a non-API error", () => {
    expect(otpErrorMessage({ status: 429, message: "Too many requests — try again later" }, "x")).toBe("Too many requests — try again later");
    expect(otpErrorMessage({ status: 0, message: "Can't reach LyniaGo — check your connection and try again." }, "x")).toBe(
      "Can't reach LyniaGo — check your connection and try again.",
    );
    expect(otpErrorMessage(new Error("boom"), "Couldn't verify the code.")).toBe("Couldn't verify the code.");
  });
});
