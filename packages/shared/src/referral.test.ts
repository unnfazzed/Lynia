import { describe, expect, it } from "vitest";
import {
  normalizeReferralCode,
  referralCodeFromInstallReferrer,
  referralInstallReferrer,
  referralLink,
  REFERRAL_CODE_ALPHABET,
} from "./referral";

describe("normalizeReferralCode", () => {
  it("upper-cases and strips spaces and dashes", () => {
    expect(normalizeReferralCode("k7p-3qx")).toBe("K7P3QX");
    expect(normalizeReferralCode(" K7P 3QX ")).toBe("K7P3QX");
  });

  it("refuses the wrong length, look-alike letters and non-strings", () => {
    expect(normalizeReferralCode("K7P3Q")).toBeNull();
    expect(normalizeReferralCode("K7P3QXX")).toBeNull();
    expect(normalizeReferralCode("K7P30X")).toBeNull(); // 0
    expect(normalizeReferralCode("K7PIQX")).toBeNull(); // I
    expect(normalizeReferralCode(undefined)).toBeNull();
    expect(normalizeReferralCode(123456)).toBeNull();
  });

  it("has no look-alike characters in the alphabet", () => {
    for (const c of "01OIL") expect(REFERRAL_CODE_ALPHABET).not.toContain(c);
  });
});

describe("referralCodeFromInstallReferrer", () => {
  it("reads the code the website writes, decoded or encoded", () => {
    const ref = referralInstallReferrer("K7P3QX");
    expect(referralCodeFromInstallReferrer(ref)).toBe("K7P3QX");
    expect(referralCodeFromInstallReferrer(encodeURIComponent(ref))).toBe("K7P3QX");
  });

  it("ignores installs that didn't come from a biker's link", () => {
    expect(referralCodeFromInstallReferrer("utm_source=google-play&utm_medium=organic")).toBeNull();
    expect(referralCodeFromInstallReferrer("utm_source=lyniago.com&utm_medium=website&utm_campaign=download")).toBeNull();
    expect(referralCodeFromInstallReferrer("utm_medium=biker_referral&utm_content=nope")).toBeNull();
    expect(referralCodeFromInstallReferrer("")).toBeNull();
    expect(referralCodeFromInstallReferrer(null)).toBeNull();
    expect(referralCodeFromInstallReferrer("%E0%A4%A")).toBeNull();
  });

  it("pins the exact referrer the website Worker writes (apps/website/referral.js)", () => {
    expect(referralInstallReferrer("K7P3QX")).toBe(
      "utm_source=lyniago.com&utm_medium=biker_referral&utm_campaign=biker_referral&utm_content=K7P3QX",
    );
    expect(referralLink("K7P3QX")).toBe("https://lyniago.com/r/K7P3QX");
  });
});
