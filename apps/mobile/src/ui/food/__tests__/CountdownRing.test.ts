import { formatCountdown } from "../CountdownRing";

describe("formatCountdown", () => {
  it("formats a full 3:00 accept window", () => {
    expect(formatCountdown(180_000)).toBe("3:00");
  });

  it("formats a sub-minute remainder with a padded seconds field", () => {
    expect(formatCountdown(52_000)).toBe("0:52");
  });

  it("floors partial seconds rather than rounding up", () => {
    expect(formatCountdown(1_999)).toBe("0:01");
  });

  it("never goes negative", () => {
    expect(formatCountdown(-5_000)).toBe("0:00");
  });
});
