import { describe, expect, it } from "vitest";
import { otpErrorMessage } from "./otp-message";

/** MJ-L10 (merchant journey audit 2026-10-07): the OTP cap message said nothing about how long to wait. */
describe("otpErrorMessage", () => {
  const capped = (retryAfter: unknown) => ({ status: 429, message: "Too many requests — try again later", retryAfter });

  it("names the wait from the API's retryAfter: whole minutes under an hour, whole hours above", () => {
    expect(otpErrorMessage(capped(1740), "x")).toBe("Too many tries. Try again in 29 min.");
    expect(otpErrorMessage(capped(20), "x")).toBe("Too many tries. Try again in 1 min.");
    expect(otpErrorMessage(capped(3600), "x")).toBe("Too many tries. Try again in 1 h.");
    expect(otpErrorMessage(capped(5400), "x")).toBe("Too many tries. Try again in 2 h.");
  });

  it("without a usable retryAfter keeps the API's sentence; a non-API error gets the fallback", () => {
    expect(otpErrorMessage(capped(undefined), "x")).toBe("Too many requests — try again later");
    expect(otpErrorMessage(capped(0), "x")).toBe("Too many requests — try again later");
    expect(otpErrorMessage({ status: 400, message: "Enter a valid phone number" }, "x")).toBe("Enter a valid phone number");
    expect(otpErrorMessage(new Error("boom"), "Couldn't send the code. Try again.")).toBe("Couldn't send the code. Try again.");
    expect(otpErrorMessage(null, "fallback")).toBe("fallback");
  });
});
