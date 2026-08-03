import { describe, expect, it } from "vitest";
import { carrierFromMccMnc, carrierFromPhone } from "./otp-carrier";

describe("carrierFromMccMnc", () => {
  it.each([
    ["64801", "netone"],
    ["64803", "telecel"],
    ["64804", "econet"],
  ])("maps %s to %s", (mccMnc, carrier) => {
    expect(carrierFromMccMnc(mccMnc)).toBe(carrier);
  });

  it("collapses an unmapped or missing mcc_mnc to 'other'", () => {
    expect(carrierFromMccMnc("64899")).toBe("other");
    expect(carrierFromMccMnc("23415")).toBe("other");
    expect(carrierFromMccMnc(undefined)).toBe("other");
  });
});

describe("carrierFromPhone", () => {
  it.each([
    ["+263771234567", "econet"],
    ["+263781234567", "econet"],
    ["+263861234567", "netone"],
    ["+263881234567", "telecel"],
  ])("maps %s to %s", (phone, carrier) => {
    expect(carrierFromPhone(phone)).toBe(carrier);
  });

  // 071/073 are shared across carriers post-portability — must degrade to "other" rather than guess.
  it("does not guess on ambiguous, ported prefixes", () => {
    expect(carrierFromPhone("+263711234567")).toBe("other");
    expect(carrierFromPhone("+263731234567")).toBe("other");
  });

  it("collapses a non-Zimbabwe or malformed number to 'other'", () => {
    expect(carrierFromPhone("+14155551234")).toBe("other");
    expect(carrierFromPhone("not-a-phone")).toBe("other");
  });
});
