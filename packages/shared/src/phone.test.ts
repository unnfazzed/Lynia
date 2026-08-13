import { describe, expect, it } from "vitest";
import { formatPhoneDisplay, formatPhoneLocal, normalizePhone } from "./phone";

describe("formatPhoneLocal", () => {
  it("renders a ZW number in local trunk-0 form, dropping +263", () => {
    expect(formatPhoneLocal("+263778831938")).toBe("0778831938");
    expect(formatPhoneLocal("+263 77 883 1938")).toBe("0778831938");
    expect(formatPhoneLocal("263778831938")).toBe("0778831938");
  });

  it("is idempotent on an already-local number", () => {
    expect(formatPhoneLocal("0778831938")).toBe("0778831938");
  });

  it("agrees with normalizePhone as the inverse presentation of E.164", () => {
    const e164 = normalizePhone("0778831938");
    expect(e164).toBe("+263778831938");
    expect(formatPhoneLocal(e164!)).toBe("0778831938");
  });

  it("keeps a genuine foreign number in international form (no local trunk to show)", () => {
    expect(formatPhoneLocal("+447911123456")).toBe("+447911123456");
  });

  it("returns short codes and unparseable input trimmed, never mangled", () => {
    expect(formatPhoneLocal("999")).toBe("999");
    expect(formatPhoneLocal("  ")).toBe("");
    expect(formatPhoneLocal("")).toBe("");
  });
});

describe("formatPhoneDisplay", () => {
  it("renders the mock's spaced E.164 form for ZW numbers, from any input spelling", () => {
    expect(formatPhoneDisplay("+263772451180")).toBe("+263 77 245 1180");
    expect(formatPhoneDisplay("0772451180")).toBe("+263 77 245 1180");
    expect(formatPhoneDisplay("263 77 245 1180")).toBe("+263 77 245 1180");
  });

  it("keeps plain E.164 for a non-9-digit national or foreign number (no wrong grouping)", () => {
    expect(formatPhoneDisplay("+27821234567")).toBe("+27821234567");
  });

  it("returns implausible input trimmed and unchanged (display never drops text)", () => {
    expect(formatPhoneDisplay(" 999 ")).toBe("999");
  });
});
