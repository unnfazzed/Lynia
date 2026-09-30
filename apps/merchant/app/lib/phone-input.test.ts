import { describe, expect, it } from "vitest";
import { formatLocalDigits, localDigits, toE164 } from "./phone-input";

describe("the sign-in phone field (merchant-mobile A1: +263 is fixed)", () => {
  it("takes a number typed with the leading 0, or pasted with +263 or 263, down to its 9 local digits", () => {
    expect(localDigits("0771234567")).toBe("771234567");
    expect(localDigits("+263 77 123 4567")).toBe("771234567");
    expect(localDigits("263771234567")).toBe("771234567");
    expect(localDigits("77-123-4567")).toBe("771234567");
    expect(localDigits("77123456789")).toBe("771234567");
  });

  it("shows the digits the way they're written locally, as far as they go", () => {
    expect(formatLocalDigits("771234567")).toBe("77 123 4567");
    expect(formatLocalDigits("7712")).toBe("77 12");
    expect(formatLocalDigits("")).toBe("");
  });

  it("sends the number with the country code", () => {
    expect(toE164("771234567")).toBe("+263771234567");
  });
});
