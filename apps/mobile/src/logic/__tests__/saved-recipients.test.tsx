import { clampRecipients, MAX_RECIPIENTS, normalizePhone, type Recipient } from "../saved-recipients";

describe("normalizePhone", () => {
  it("strips all non-digits so equivalent numbers match", () => {
    expect(normalizePhone("+263 77 123 4567")).toBe("263771234567");
    expect(normalizePhone("0771234567")).toBe("0771234567");
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

  it("dedupes by normalised phone, first wins", () => {
    const out = clampRecipients([r("+263 77 123 4567", "Rita"), r("0771234567", "Someone else spelling")]);
    // Different textual phones — but only one is kept if they normalise the same? These normalise
    // differently (country code vs local), so BOTH are distinct recipients.
    expect(out.length).toBe(2);

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
