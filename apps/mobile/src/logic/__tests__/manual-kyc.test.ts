/** D-122 (manual KYC): the "N of 4" sign-up count (KB-02), the licence date parsing and the expiry rule. */
import { formatLicenceExpiry, kycDocsComplete, licenceExpiredOn, manualDocsProgress, manualSetupComplete, parseLicenceExpiry } from "../manual-kyc";
import { onlineGateReason } from "../gates";

describe("manualDocsProgress", () => {
  // KB-02: only what review needs counts, so the bars reach the end when the biker has done their part.
  it("counts the ID number and the three document photos out of 4", () => {
    expect(manualDocsProgress(null)).toEqual({ done: 0, total: 4 });
    expect(manualDocsProgress({ kycStatus: "pending", kycDocs: { idFront: true, licence: false, selfieId: true } })).toEqual({ done: 2, total: 4 });
    expect(manualDocsProgress({ kycStatus: "pending", kycDocs: { idFront: true, licence: true, selfieId: true } }, "63-123456A78")).toEqual({ done: 4, total: 4 });
    // A passed check stands in for the typed number.
    expect(manualDocsProgress({ kycStatus: "verified", kycDocs: { idFront: true, licence: true, selfieId: true } })).toEqual({ done: 4, total: 4 });
  });
  it("sign-up is complete only with the ID number and all three photos", () => {
    const all = { kycStatus: "pending", kycDocs: { idFront: true, licence: true, selfieId: true } };
    expect(manualSetupComplete(all, null)).toBe(false);
    expect(manualSetupComplete(all, "63-123456A78")).toBe(true);
    expect(manualSetupComplete({ ...all, kycDocs: { idFront: true, licence: true, selfieId: false } }, "63-123456A78")).toBe(false);
  });
  it("a set is complete only with all three photos", () => {
    expect(kycDocsComplete({ idFront: true, licence: true, selfieId: false })).toBe(false);
    expect(kycDocsComplete({ idFront: true, licence: true, selfieId: true })).toBe(true);
    expect(kycDocsComplete(undefined)).toBe(false);
  });
});

describe("licence expiry", () => {
  it("reads DD/MM/YYYY (also . or -) and refuses dates that don't exist", () => {
    expect(parseLicenceExpiry("31/01/2028")).toBe("2028-01-31");
    expect(parseLicenceExpiry(" 5.3.2027 ")).toBe("2027-03-05");
    expect(parseLicenceExpiry("29/02/2027")).toBeNull();
    expect(parseLicenceExpiry("2028-01-31")).toBeNull();
    expect(formatLicenceExpiry("2028-01-31")).toBe("31/01/2028");
  });
  it("is valid through its expiry day and expired from the next", () => {
    expect(licenceExpiredOn("2026-11-04", new Date("2026-11-04T22:00:00Z"))).toBe(false);
    expect(licenceExpiredOn("2026-11-04", new Date("2026-11-05T00:01:00Z"))).toBe(true);
    expect(licenceExpiredOn(null)).toBe(false);
  });
  it("a licence refusal from the server is not mistaken for an expired ID", () => {
    expect(onlineGateReason({ code: "licence_expired", message: "x" })).toBe("licence_expired");
    expect(onlineGateReason({ message: "Your driving licence has expired — add your new licence" })).toBe("licence_expired");
    expect(onlineGateReason({ message: "Your ID has expired — re-verify" })).toBe("kyc_expired");
  });
});
