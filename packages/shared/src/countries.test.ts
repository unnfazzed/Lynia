import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  COUNTRY_PICKER_ORDER,
  countryByIso,
  countryFlag,
  countryForE164,
  countryForTimeZone,
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

  it("keeps the source list itself A–Z, so the picker needs no sort at start-up (D-116 review)", () => {
    const names = COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("lists the territories the first cut missed (D-116 review)", () => {
    for (const [iso, dial] of [["XK", "383"], ["FO", "298"], ["GL", "299"], ["GP", "590"], ["GF", "594"], ["MQ", "596"], ["CW", "599"], ["NC", "687"], ["PF", "689"]]) {
      expect(countryByIso(iso!)?.dial).toBe(dial);
      expect(countryForE164(`+${dial}123456789`)?.iso).toBe(iso);
    }
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
    // Italy and Côte d'Ivoire keep their leading 0 (it is part of the number).
    expect(nationalDigits("06 1234 5678", IT)).toBe("0612345678");
    expect(nationalDigits("07 07 12 34 56", countryByIso("CI")!)).toBe("0707123456");
    expect(nationalDigits("1".repeat(30), US)).toHaveLength(14);
  });

  it("builds an E.164 number normalizePhone keeps as-is", () => {
    const e = toE164(GB, "7911123456");
    expect(e).toBe("+447911123456");
    expect(normalizePhone(e)).toBe(e);
    expect(intlPhoneProblem("7911123456", GB)).toBeNull();
    expect(intlPhoneProblem("79111", GB)).toBe("short");
  });

  it("one SIM is one identity: a number from abroad written with its trunk 0 normalizes the same (D-116 review)", () => {
    for (const raw of ["+44 07911 123456", "+44007911123456", "0044 07911 123456"]) expect(normalizePhone(raw)).toBe("+447911123456");
    expect(normalizePhone("+27 082 123 4567")).toBe("+27821234567");
    // Where the 0 is part of the number it stays.
    expect(normalizePhone("+39 06 1234 5678")).toBe("+390612345678");
    expect(normalizePhone("+225 07 07 12 34 56")).toBe("+2250707123456");
    // Zimbabwe is unchanged.
    expect(normalizePhone("+263 0771234567")).toBe("+263771234567");
    expect(normalizePhone("0771234567")).toBe("+263771234567");
  });

  it("starts the picker on the phone's own country, by its time zone (D-116 review)", () => {
    expect(countryForTimeZone("Africa/Harare")?.iso).toBe("ZW");
    expect(countryForTimeZone("Africa/Johannesburg")?.iso).toBe("ZA");
    expect(countryForTimeZone("Africa/Lusaka")?.iso).toBe("ZM");
    expect(countryForTimeZone("Europe/London")?.iso).toBe("GB");
    expect(countryForTimeZone("America/Chicago")?.iso).toBe("US");
    expect(countryForTimeZone("America/Toronto")?.iso).toBe("CA");
    expect(countryForTimeZone("Australia/Perth")?.iso).toBe("AU");
    // Nothing to go on: the caller keeps Zimbabwe.
    for (const z of [undefined, "", "UTC", "Etc/UTC", "Africa/Cairo"]) expect(countryForTimeZone(z)).toBeUndefined();
  });
});
