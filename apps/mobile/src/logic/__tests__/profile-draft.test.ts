const store: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: async (k: string) => store[k] ?? null,
  setItemAsync: async (k: string, v: string) => {
    store[k] = v;
  },
  deleteItemAsync: async (k: string) => {
    delete store[k];
  },
}));

import { PROFILE_DRAFT_KEY, loadProfileDraft, profileDraftHasContent, saveProfileDraft, type ProfileDraft } from "../profile-draft";

const empty: ProfileDraft = { firstName: "", lastName: "" };

describe("profileDraftHasContent", () => {
  it("is false for an all-empty draft (no 'restored' cue for nothing)", () => {
    expect(profileDraftHasContent(empty)).toBe(false);
    expect(profileDraftHasContent({ ...empty, firstName: "   " })).toBe(false); // whitespace-only doesn't count
  });

  it("is true once any name is present", () => {
    expect(profileDraftHasContent({ ...empty, firstName: "Tendai" })).toBe(true);
    expect(profileDraftHasContent({ ...empty, lastName: "Moyo" })).toBe(true);
  });
});

// C5 has no ID field since D-55: the draft holds the names and nothing else.
describe("the draft holds the names only", () => {
  it("writes no idNumber", async () => {
    await saveProfileDraft({ firstName: "Tendai", lastName: "Moyo" });
    expect(JSON.parse(store[PROFILE_DRAFT_KEY]!)).toEqual({ firstName: "Tendai", lastName: "Moyo" });
  });

  it("reads an older build's draft as its names alone", async () => {
    store[PROFILE_DRAFT_KEY] = JSON.stringify({ firstName: "Chipo", lastName: "", idNumber: "63-123456X22" });
    expect(await loadProfileDraft()).toEqual({ firstName: "Chipo", lastName: "" });
  });
});
