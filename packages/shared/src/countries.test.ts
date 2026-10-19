import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  COUNTRY_PICKER_ORDER,
  countryByIso,
  countryFlag,
  countryForE164,
  countryMatches,
  intlPhoneProblem,
  nationalDigits,
  normalizePhone,
  PINNED_COUNTRY_COUNT,
  toE164,
} from "./index";

const GB = countryByIso("GB")!;
const IT = countryByIso("IT")!;
const US = countryByIso("US")!;

describe("countries (diaspora sign-up, owner 2026-10-19)", () => {
  it("lists every country once, with a 1–3 digit calling code", () => {
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) {
      expect(c.iso).toMatch(/^[A-Z]{2}$/);
      expect(c.dial).toMatch(/^[1-9]\d{0,2}$/);
    }
  });

  it("orders the picker: Zimbabwe, the ten diaspora countries, then the rest A–Z", () => {
    expect(COUNTRY_PICKER_ORDER.map((c) => c.iso).slice(0, PINNED_COUNTRY_COUNT)).toEqual(["ZW", "ZA", "GB", "BW", "MZ", "MW", "US", "AU", "ZM", "CA", "NZ"]);
    const rest = COUNTRY_PICKER_ORDER.slice(PINNED_COUNTRY_COUNT).map((c) => c.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b, "en")));
    expect(COUNTRY_PICKER_ORDER).toHaveLength(COUNTRIES.length);
  });

  it("draws the flag from the ISO code", () => {
    expect(countryFlag("ZW")).toBe("🇿🇼");
    expect(countryFlag("gb")).toBe("🇬🇧");
  });

  it("resolves a pasted number to its country, preferring the main one for a shared code", () => {
    expect(countryForE164("+447911123456")?.iso).toBe("GB");
    expect(countryForE164("+14155551234")?.iso).toBe("US");
    expect(countryForE164("+27821234567")?.iso).toBe("ZA");
    expect(countryForE164("+263772451180")?.iso).toBe("ZW");
    expect(countryForE164("+999")).toBeUndefined();
  });

  it("searches by name, code, calling code and accents", () => {
    expect(countryMatches(GB, "united k")).toBe(true);
    expect(countryMatches(GB, "uk")).toBe(true);
    expect(countryMatches(GB, "+44")).toBe(true);
    expect(countryMatches(GB, "27")).toBe(false);
    expect(countryMatches(countryByIso("CI")!, "cote")).toBe(true);
    expect(countryMatches(GB, "  ")).toBe(true);
  });

  it("reduces typed and pasted numbers to the national digits", () => {
    expect(nationalDigits("07911 123456", GB)).toBe("7911123456");
    expect(nationalDigits("+44 7911 123456", GB)).toBe("7911123456");
    expect(nationalDigits("0044 7911 123456", GB)).toBe("7911123456");
    expect(nationalDigits("(415) 555-1234", US)).toBe("4155551234");
    // Italy keeps its leading 0.
    expect(nationalDigits("06 1234 5678", IT)).toBe("0612345678");
    expect(nationalDigits("1".repeat(30), US)).toHaveLength(14);
  });

  it("builds an E.164 number normalizePhone keeps as-is", () => {
    const e = toE164(GB, "7911123456");
    expect(e).toBe("+447911123456");
    expect(normalizePhone(e)).toBe(e);
    expect(intlPhoneProblem("7911123456", GB)).toBeNull();
    expect(intlPhoneProblem("79111", GB)).toBe("short");
  });
});
