import { formatMoneyRange } from "../money";

describe("formatMoneyRange (D-128)", () => {
  it("drops a whole dollar's .00 and keeps cents", () => {
    expect(formatMoneyRange(2, 3)).toBe("$2–3");
    expect(formatMoneyRange(2.5, 3.5)).toBe("$2.50–3.50");
  });

  it("reads as one price with no low end or equal ends", () => {
    expect(formatMoneyRange(null, 1.5)).toBe("$1.50");
    expect(formatMoneyRange(1.5, 1.5)).toBe("$1.50");
  });
});
