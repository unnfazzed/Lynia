import { parseNum, randomUuidV4 } from "../util";

describe("parseNum", () => {
  it("accepts a comma decimal separator (Android locale decimal-pad)", () => {
    expect(parseNum("-17,82")).toBe(-17.82);
  });

  it("returns null for empty/invalid input instead of NaN", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("abc")).toBeNull();
  });
});

describe("randomUuidV4", () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it("produces an RFC4122-v4-shaped string (the server's zod .uuid() check requires this)", () => {
    for (let i = 0; i < 20; i++) {
      expect(randomUuidV4()).toMatch(UUID_V4);
    }
  });

  it("doesn't repeat across calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => randomUuidV4()));
    expect(ids.size).toBe(50);
  });
});
