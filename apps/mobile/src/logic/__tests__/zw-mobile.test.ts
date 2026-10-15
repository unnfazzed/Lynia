import { formatZwNational, zwE164, zwMobileProblem, zwNationalDigits } from "../zw-mobile";

describe("zw-mobile (Calm Mint v2 C2)", () => {
  it("reduces every way people write their number to the nine national digits", () => {
    expect(zwNationalDigits("77 245 1180")).toBe("772451180");
    expect(zwNationalDigits("0772451180")).toBe("772451180");
    expect(zwNationalDigits("+263 77 245 1180")).toBe("772451180");
    expect(zwNationalDigits("263772451180")).toBe("772451180");
    expect(zwNationalDigits("7724511809999")).toBe("772451180");
  });

  it("JQ-R4-05: drops a country code typed digit by digit, as the field re-reads each keystroke", () => {
    let field = "";
    for (const key of "263772451180") field = formatZwNational(zwNationalDigits(field + key));
    expect(zwNationalDigits(field)).toBe("772451180");
    expect(zwMobileProblem(zwNationalDigits(field))).toBeNull();
    expect(zwNationalDigits("2630772451180")).toBe("772451180");
    // A bare "263" mid-typing is kept until the next digit says what it is.
    expect(zwNationalDigits("263")).toBe("263");
  });

  it("groups as typed: 77 245 1180", () => {
    expect(formatZwNational("77")).toBe("77");
    expect(formatZwNational("772")).toBe("77 2");
    expect(formatZwNational("77245")).toBe("77 245");
    expect(formatZwNational("772451180")).toBe("77 245 1180");
  });

  it("flags a short number (C3) and a non-mobile prefix", () => {
    expect(zwMobileProblem("77245118")).toBe("short");
    expect(zwMobileProblem("242123456")).toBe("not-mobile");
    for (const p of ["71", "73", "77", "78"]) expect(zwMobileProblem(`${p}2451180`)).toBeNull();
  });

  it("sends E.164", () => {
    expect(zwE164("772451180")).toBe("+263772451180");
  });
});
