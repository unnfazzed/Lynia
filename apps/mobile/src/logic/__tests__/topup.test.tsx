import { validateTopupAmount } from "../topup";

describe("validateTopupAmount (WD-009 — follows the bounds it's given, not a bundled constant)", () => {
  it("is valid within [minTopUp, maxTopUp]", () => {
    expect(validateTopupAmount("10", 5, 50)).toBeNull();
    expect(validateTopupAmount("5", 5, 50)).toBeNull();
    expect(validateTopupAmount("50", 5, 50)).toBeNull();
  });

  it("rejects below the given minimum, using the given bound in the message", () => {
    expect(validateTopupAmount("4", 5, 50)).toBe("Enter at least $5.00");
  });

  it("rejects above the given maximum, using the given bound in the message", () => {
    expect(validateTopupAmount("51", 5, 50)).toBe("The most you can top up at once is $50.00");
  });

  it("tracks bounds that diverge from the bundled COMMISSION default — the server config case", () => {
    // A server-configured policy different from the bundled fallback (e.g. an ops-tuned min/max) must
    // be what's actually validated against, not silently ignored in favor of the app's built-in default.
    expect(validateTopupAmount("3", 2, 20)).toBeNull(); // would fail against the bundled default (min 5)
    expect(validateTopupAmount("30", 2, 20)).toBe("The most you can top up at once is $20.00");
  });

  it("is empty-string-safe (no error while the field is untouched)", () => {
    expect(validateTopupAmount("", 5, 50)).toBeNull();
    expect(validateTopupAmount("   ", 5, 50)).toBeNull();
  });

  it("rejects non-numeric input via the minimum-bound message", () => {
    expect(validateTopupAmount("abc", 5, 50)).toBe("Enter at least $5.00");
  });
});
