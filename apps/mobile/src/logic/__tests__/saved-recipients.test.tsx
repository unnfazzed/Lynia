import { clampRecipients, MAX_RECIPIENTS, normalizePhone, type Recipient } from "../saved-recipients";

describe("normalizePhone", () => {
  it("canonicalizes to E.164 so equivalent local/international numbers match (F-05)", () => {
    // Local trunk-0 and international spellings of the SAME ZW number now collapse to one key,
    // so the recipient dedupes instead of persisting as two chips.
    expect(normalizePhone("+263 77 123 4567")).toBe("+263771234567");
    expect(normalizePhone("0771234567")).toBe("+263771234567");
  });
  it("tolerates empty/garbage", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("abc")).toBe("");
  });
});

describe("clampRecipients", () => {
  const r = (phone: string, name = ""): Recipient => ({ phone, name });

  it("drops rows with an unusable (too-short) phone", () => {
    expect(clampRecipients([r("123"), r("+263771234567")])).toEqual([r("+263771234567")]);
  });

  it("dedupes by canonical phone, first wins (F-05)", () => {
    // Local (`0771234567`) and international (`+263 77 123 4567`) spellings of the same ZW number
    // canonicalize to one E.164 key, so they collapse to a single recipient (first spelling wins).
    const out = clampRecipients([r("+263 77 123 4567", "Rita"), r("0771234567", "Someone else spelling")]);
    expect(out.length).toBe(1);
    expect(out[0]?.name).toBe("Rita"); // first wins

    const dupes = clampRecipients([r("263771234567", "A"), r("263 77 123 4567", "B")]);
    expect(dupes.length).toBe(1);
    expect(dupes[0]?.name).toBe("A"); // first wins
  });

  it("caps at MAX_RECIPIENTS", () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 4 }, (_, i) => r(`26377100000${i}`));
    expect(clampRecipients(many).length).toBe(MAX_RECIPIENTS);
  });

  it("returns [] for non-arrays", () => {
    expect(clampRecipients(null)).toEqual([]);
    expect(clampRecipients(undefined)).toEqual([]);
    expect(clampRecipients("nope")).toEqual([]);
  });

  it("trims/bounds name and phone lengths", () => {
    const out = clampRecipients([{ phone: "  +263771234567  ", name: "  Rita  " }]);
    expect(out[0]?.name).toBe("Rita");
    expect(out[0]?.phone).toBe("+263771234567");
  });
});
