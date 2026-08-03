import { profileDraftHasContent, type ProfileDraft } from "../profile-draft";

const empty: ProfileDraft = { firstName: "", lastName: "", idNumber: "" };

describe("profileDraftHasContent", () => {
  it("is false for an all-empty draft (no 'restored' cue for nothing)", () => {
    expect(profileDraftHasContent(empty)).toBe(false);
    expect(profileDraftHasContent({ ...empty, firstName: "   " })).toBe(false); // whitespace-only doesn't count
  });

  it("is true once any field is present", () => {
    expect(profileDraftHasContent({ ...empty, idNumber: "63-123456X22" })).toBe(true);
    expect(profileDraftHasContent({ ...empty, firstName: "Tendai" })).toBe(true);
    expect(profileDraftHasContent({ ...empty, lastName: "Moyo" })).toBe(true);
  });
});
