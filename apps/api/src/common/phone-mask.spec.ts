import { describe, expect, it } from "vitest";
import { maskPhone } from "./phone-mask";

describe("maskPhone (A-03 admin PII masking)", () => {
  it("keeps the country code + last 4 digits and bullets the middle", () => {
    expect(maskPhone("+263782000001")).toBe("+263•••••0001");
    expect(maskPhone("+263771234567")).toBe("+263•••••4567");
  });

  it("D-116: keeps the real calling code of a foreign number", () => {
    expect(maskPhone("+447911123456")).toBe("+44••••••3456");
    expect(maskPhone("+27821234567")).toBe("+27•••••4567");
    expect(maskPhone("+14155551234")).toBe("+1••••••1234");
  });

  it("never leaks the masked middle digits", () => {
    const masked = maskPhone("+263782000001");
    expect(masked).not.toContain("78200");
    expect(masked).not.toContain("2000");
  });

  it("masks a number with no country code by digits", () => {
    expect(maskPhone("0782000001")).toBe("••••••0001");
  });

  it("degrades short/garbage input to a fully-bulleted token (no partial leak)", () => {
    expect(maskPhone("123")).toBe("•••");
    expect(maskPhone("")).toBe("");
    expect(maskPhone(null)).toBe("");
    expect(maskPhone(undefined)).toBe("");
  });
});
