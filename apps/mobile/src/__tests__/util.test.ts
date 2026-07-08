import { parseNum, randomUuidV4, uuidV4FromSeed } from "../util";

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

describe("uuidV4FromSeed", () => {
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it("is v4-shaped so it passes the server's zod .uuid() contract", () => {
    for (const seed of ["", "a", "nonce|1.2,3.4|5.6,7.8|[]|note|0|10", "🚴‍♂️ unicode seed"]) {
      expect(uuidV4FromSeed(seed)).toMatch(UUID_V4);
    }
  });

  it("is deterministic — the same seed reproduces the same id across calls (survives an app restart)", () => {
    const seed = "abc123|-17.8,31.0|-17.9,31.1|[{\"description\":\"box\",\"quantity\":1}]|hi|0|12";
    expect(uuidV4FromSeed(seed)).toBe(uuidV4FromSeed(seed));
  });

  it("changes when the order content changes (a genuinely different order gets a different key)", () => {
    const base = "nonce|-17.8,31.0|-17.9,31.1|[]|note|0|12";
    expect(uuidV4FromSeed(base)).not.toBe(uuidV4FromSeed("nonce|-17.8,31.0|-17.9,31.1|[]|note|0|13"));
    // Rotating the nonce (post-successful-create) also yields a fresh key for identical content.
    expect(uuidV4FromSeed(base)).not.toBe(uuidV4FromSeed(`nonce2|${base.split("|").slice(1).join("|")}`));
  });
});
