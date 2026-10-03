import { kycDraftHasContent, KYC_DRAFT_KEY, loadKycDraft, saveKycDraft, type KycDraft } from "../kyc-draft";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const empty: KycDraft = { firstName: "", lastName: "" };

describe("kycDraftHasContent", () => {
  it("is false for an all-empty draft (no 'restored' cue for nothing)", () => {
    expect(kycDraftHasContent(empty)).toBe(false);
    expect(kycDraftHasContent({ ...empty, firstName: "   " })).toBe(false); // whitespace-only doesn't count
  });

  it("is true once either name is present", () => {
    expect(kycDraftHasContent({ ...empty, firstName: "Tendai" })).toBe(true);
    expect(kycDraftHasContent({ ...empty, lastName: "Moyo" })).toBe(true);
  });
});

describe("loadKycDraft", () => {
  const mockGetItemAsync = jest.requireMock("expo-secure-store").getItemAsync as jest.Mock;

  it("round-trips the name", async () => {
    mockGetItemAsync.mockResolvedValueOnce(JSON.stringify({ firstName: "Tendai", lastName: "Moyo" }));
    expect(await loadKycDraft()).toEqual({ firstName: "Tendai", lastName: "Moyo" });
  });

  // D-75: the national ID is no longer typed before the ID check, so a draft keeps only the name. An
  // older stored draft may still carry the ID, the bike plate (D-55) or photo fields (D-62): all dropped,
  // so an ID-only old draft no longer shows a "restored" cue over an empty form.
  it("drops the national ID, the bike plate and the photo fields of an older draft", async () => {
    mockGetItemAsync.mockResolvedValueOnce(
      JSON.stringify({ firstName: "", lastName: "", idNumber: "63-123456X22", bikeReg: "ABC1234", photoKey: "kyc/abc.jpg", photoUri: "file://a.jpg" }),
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

describe("saveKycDraft", () => {
  const mockSetItemAsync = jest.requireMock("expo-secure-store").setItemAsync as jest.Mock;

  it("writes the name and nothing else, even when handed more", async () => {
    mockSetItemAsync.mockClear();
    await saveKycDraft({ firstName: "Tendai", lastName: "Moyo", idNumber: "63123456A42" } as KycDraft);
    expect(mockSetItemAsync).toHaveBeenCalledWith(KYC_DRAFT_KEY, JSON.stringify({ firstName: "Tendai", lastName: "Moyo" }));
  });
});
