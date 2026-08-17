import { parseInterest } from "../service-interest";

/**
 * The stored half of the SOON tile's notify-me sheet. The effectful half (SecureStore +
 * `expo-notifications`) is best-effort by construction and covered where the sheet is exercised;
 * what matters here is that a corrupt slot can never paint a wrong "we'll let you know" state.
 */
describe("parseInterest", () => {
  it("round-trips a stored list", () => {
    expect(parseInterest(JSON.stringify(["pharm"]))).toEqual(["pharm"]);
  });

  it("treats an absent or unreadable slot as no interest recorded", () => {
    expect(parseInterest(null)).toEqual([]);
    expect(parseInterest("")).toEqual([]);
    expect(parseInterest("not json")).toEqual([]);
    expect(parseInterest(JSON.stringify({ pharm: true }))).toEqual([]);
  });

  it("drops non-string entries rather than trusting the whole slot", () => {
    expect(parseInterest(JSON.stringify(["pharm", 7, null, "grocery"]))).toEqual(["pharm", "grocery"]);
  });
});
