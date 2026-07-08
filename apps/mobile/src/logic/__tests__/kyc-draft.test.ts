import { kycDraftHasContent, type KycDraft } from "../kyc-draft";

const empty: KycDraft = { firstName: "", lastName: "", idNumber: "", bikeReg: "", photoKey: null, photoUri: null };

describe("kycDraftHasContent", () => {
  it("is false for an all-empty draft (no 'restored' cue for nothing)", () => {
    expect(kycDraftHasContent(empty)).toBe(false);
    expect(kycDraftHasContent({ ...empty, firstName: "   " })).toBe(false); // whitespace-only doesn't count
  });

  it("is true once any field or the uploaded photo is present", () => {
    expect(kycDraftHasContent({ ...empty, idNumber: "63-123456X22" })).toBe(true);
    expect(kycDraftHasContent({ ...empty, firstName: "Tendai" })).toBe(true);
    expect(kycDraftHasContent({ ...empty, bikeReg: "ABC1234" })).toBe(true);
    expect(kycDraftHasContent({ ...empty, photoKey: "kyc/abc.jpg" })).toBe(true);
  });
});
