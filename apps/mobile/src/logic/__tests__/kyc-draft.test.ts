import { kycDraftHasContent, loadKycDraft, type KycDraft } from "../kyc-draft";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const empty: KycDraft = { firstName: "", lastName: "", idNumber: "", bikeReg: "", photoKey: null, photoUri: null, pendingPhoto: null };

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

  // C-O8 (LC-C11): a not-yet-uploaded photo is real content too — the "restored" cue should still
  // show even if it's the ONLY thing saved (a kill on the very first capture attempt, before any
  // text field was typed).
  it("is true when only an unresolved pendingPhoto is present", () => {
    expect(kycDraftHasContent({ ...empty, pendingPhoto: { uri: "file://x.jpg", contentType: "image/jpeg" } })).toBe(true);
  });
});

describe("loadKycDraft — pendingPhoto parsing (C-O8/LC-C11)", () => {
  const mockGetItemAsync = jest.requireMock("expo-secure-store").getItemAsync as jest.Mock;

  it("round-trips a valid pendingPhoto", async () => {
    mockGetItemAsync.mockResolvedValueOnce(
      JSON.stringify({ ...empty, pendingPhoto: { uri: "file://a.jpg", width: 800, height: 600, contentType: "image/png" } }),
    );
    const d = await loadKycDraft();
    expect(d?.pendingPhoto).toEqual({ uri: "file://a.jpg", width: 800, height: 600, contentType: "image/png" });
  });

  it("rejects a malformed pendingPhoto instead of trusting it verbatim", async () => {
    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ ...empty, pendingPhoto: { uri: "", contentType: "image/jpeg" } }));
    expect((await loadKycDraft())?.pendingPhoto).toBeNull();

    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ ...empty, pendingPhoto: { uri: "file://a.jpg", contentType: "image/gif" } }));
    expect((await loadKycDraft())?.pendingPhoto).toBeNull();

    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ ...empty, pendingPhoto: "not-an-object" }));
    expect((await loadKycDraft())?.pendingPhoto).toBeNull();
  });

  it("defaults pendingPhoto to null when absent (pre-C-O8 stored drafts)", async () => {
    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify(empty));
    expect((await loadKycDraft())?.pendingPhoto).toBeNull();
  });
});
