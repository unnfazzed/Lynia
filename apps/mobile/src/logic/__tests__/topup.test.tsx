import { acceptAmountInput, floorApplies, topUpAtLeast, reconcilePendingTopup, validateTopupAmount } from "../topup";

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

describe("reconcilePendingTopup (UX-2026-07-16 — wallet-screen recovery for an app-killed top-up)", () => {
  it("resolves a succeeded top-up so the caller can invalidate the balance + show a confirmation", () => {
    expect(reconcilePendingTopup("succeeded")).toBe("succeeded");
  });

  it("keeps the marker while the top-up is still pending", () => {
    expect(reconcilePendingTopup("pending")).toBe("pending");
  });

  it("treats both terminal-no-money-moved statuses (declined, expired) as safe to clear", () => {
    expect(reconcilePendingTopup("declined")).toBe("terminal");
    expect(reconcilePendingTopup("expired")).toBe("terminal");
  });
});

describe("MA-L1: the amount takes at most two decimals", () => {
  it("ignores a third decimal and reads a comma as the point", () => {
    expect(acceptAmountInput("5.55", "5.555")).toBe("5.55");
    expect(acceptAmountInput("5", "5,5")).toBe("5.5");
    expect(acceptAmountInput("", "12.50")).toBe("12.50");
    expect(validateTopupAmount("5.555", 5, 50)).not.toBeNull();
    expect(validateTopupAmount("5.50", 5, 50)).toBeNull();
  });
});

describe("MA-H2: floorApplies mirrors the server's online gate", () => {
  it("binds only with commission on and no free jobs left", () => {
    expect(floorApplies(0, 0)).toBe(false);
    expect(floorApplies(10, 3)).toBe(false);
    expect(floorApplies(10, 0)).toBe(true);
    expect(floorApplies(10, undefined)).toBe(true);
  });
});

describe("MA-M1: the wall never asks for less than the minimum top-up", () => {
  it("is max(minTopUp, floor - balance)", () => {
    expect(topUpAtLeast(2, 0.6, 5)).toBe(5);
    expect(topUpAtLeast(20, 1, 5)).toBe(19);
  });
});
