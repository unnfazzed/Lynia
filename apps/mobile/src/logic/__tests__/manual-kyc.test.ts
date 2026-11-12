/** D-122 (manual KYC): a complete document set, and the server's licence refusal. (D-135 retired the typed licence.) */
import { kycDocsComplete } from "../manual-kyc";
import { onlineGateReason } from "../gates";

describe("kycDocsComplete", () => {
  it("a set is complete only with all three photos", () => {
    expect(kycDocsComplete({ idFront: true, licence: true, selfieId: false })).toBe(false);
    expect(kycDocsComplete({ idFront: true, licence: true, selfieId: true })).toBe(true);
    expect(kycDocsComplete(undefined)).toBe(false);
  });
});

describe("licence refusal", () => {
  it("a licence refusal from the server is not mistaken for an expired ID", () => {
    expect(onlineGateReason({ code: "licence_expired", message: "x" })).toBe("licence_expired");
    expect(onlineGateReason({ message: "Your driving licence has expired — add your new licence" })).toBe("licence_expired");
    expect(onlineGateReason({ message: "Your ID has expired — re-verify" })).toBe("kyc_expired");
  });
});
