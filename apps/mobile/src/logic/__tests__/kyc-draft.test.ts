import { kycDraftHasContent, loadKycDraft, type KycDraft } from "../kyc-draft";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const empty: KycDraft = { firstName: "", lastName: "", idNumber: "", bikeReg: "" };

describe("kycDraftHasContent", () => {
  it("is false for an all-empty draft (no 'restored' cue for nothing)", () => {
    expect(kycDraftHasContent(empty)).toBe(false);
    expect(kycDraftHasContent({ ...empty, firstName: "   " })).toBe(false); // whitespace-only doesn't count
  });

  it("is true once any field is present", () => {
    expect(kycDraftHasContent({ ...empty, idNumber: "63-123456X22" })).toBe(true);
    expect(kycDraftHasContent({ ...empty, firstName: "Tendai" })).toBe(true);
    expect(kycDraftHasContent({ ...empty, bikeReg: "ABC1234" })).toBe(true);
  });
});

describe("loadKycDraft", () => {
  const mockGetItemAsync = jest.requireMock("expo-secure-store").getItemAsync as jest.Mock;

  it("round-trips the text fields", async () => {
    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ ...empty, firstName: "Tendai", idNumber: "63-123456X22" }));
    expect(await loadKycDraft()).toEqual({ ...empty, firstName: "Tendai", idNumber: "63-123456X22" });
  });

  // D-62: the photo left sign-up. A draft stored before that may still carry photo fields; they are
  // dropped, so a photo-only old draft no longer shows a "restored" cue over an empty form.
  it("drops the photo fields of a pre-D-62 draft", async () => {
    mockGetItemAsync.mockResolvedValueOnce(
      JSON.stringify({ ...empty, photoKey: "kyc/abc.jpg", photoUri: "file://a.jpg", pendingPhoto: { uri: "file://a.jpg", contentType: "image/jpeg" } }),
    );
    const d = await loadKycDraft();
    expect(d).toEqual(empty);
    expect(kycDraftHasContent(d!)).toBe(false);
  });

  it("returns null when nothing is stored", async () => {
    mockGetItemAsync.mockResolvedValueOnce(null);
    expect(await loadKycDraft()).toBeNull();
  });
});
