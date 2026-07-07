import { AVATAR_TINTS, avatarTint, initials } from "../avatar";

describe("initials", () => {
  it("takes one letter from each of first + last", () => {
    expect(initials("Tinashe", "Moyo")).toBe("TM");
  });
  it("upper-cases regardless of input case", () => {
    expect(initials("ruvimbo", "chikafu")).toBe("RC");
  });
  it("single name → first two letters", () => {
    expect(initials("Tinashe", "")).toBe("TI");
    expect(initials("Tinashe", null)).toBe("TI");
  });
  it("lastName only (empty firstName) → first two of the last name", () => {
    expect(initials("", "Moyo")).toBe("MO");
    expect(initials(null, "Moyo")).toBe("MO");
  });
  it("falls back to a neutral dot when there's no name", () => {
    expect(initials("", "")).toBe("•");
    expect(initials(null, null)).toBe("•");
  });
  it("tolerates surrounding whitespace", () => {
    expect(initials("  Anesu ", " Dube ")).toBe("AD");
  });
});

describe("avatarTint", () => {
  it("always returns one of the palette tints", () => {
    for (const seed of ["abc", "profile-123", "Tinashe Moyo", ""]) {
      expect(AVATAR_TINTS).toContain(avatarTint(seed));
    }
  });
  it("is deterministic — same seed, same tint", () => {
    expect(avatarTint("profile-123")).toBe(avatarTint("profile-123"));
  });
});
