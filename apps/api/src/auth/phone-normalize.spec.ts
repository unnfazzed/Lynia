import { DEFAULT_COUNTRY_CODE, normalizePhone } from "@lynia/shared";
import { describe, expect, it } from "vitest";

describe("normalizePhone (E.164)", () => {
  it("collapses every common way of typing one ZW number to a single identity", () => {
    const canonical = "+263771234567";
    for (const input of [
      "+263771234567",
      "+263 77 123 4567",
      "+263-77-123-4567",
      "(263) 771234567",
      "263771234567",
      "0771234567",
      "00263771234567",
      "771234567",
    ]) {
      expect(normalizePhone(input)).toBe(canonical);
    }
  });

  it("is idempotent on an already-canonical number", () => {
    expect(normalizePhone("+263770000001")).toBe("+263770000001");
    expect(normalizePhone(normalizePhone("0770000001") as string)).toBe("+263770000001");
  });

  it("keeps a genuine foreign number that was typed with a plus", () => {
    expect(normalizePhone("+447911123456")).toBe("+447911123456");
  });

  it("honours an override country code", () => {
    expect(normalizePhone("0821234567", "27")).toBe("+27821234567");
  });

  it("defaults to Zimbabwe", () => {
    expect(DEFAULT_COUNTRY_CODE).toBe("263");
    expect(normalizePhone("0771234567")).toBe("+263771234567");
  });

  it("returns null for input that can't be a valid E.164 number", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("+12")).toBeNull(); // too short
    expect(normalizePhone("+1234567890123456")).toBeNull(); // 16 digits, too long
  });
});
