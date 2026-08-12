import { describe, expect, it } from "vitest";
import { formatPhoneLocal, normalizePhone } from "./phone";

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
