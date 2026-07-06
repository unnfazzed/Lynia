import { describe, expect, it } from "vitest";
import { corsOriginResolver, isOriginAllowed, parseAllowedOrigins } from "./cors";

describe("parseAllowedOrigins", () => {
  it("returns an empty list for an empty/undefined value", () => {
    expect(parseAllowedOrigins("")).toEqual([]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it("splits, trims, and drops blanks", () => {
    expect(parseAllowedOrigins("https://a.com, https://b.com ,, ")).toEqual(["https://a.com", "https://b.com"]);
  });
});

describe("isOriginAllowed", () => {
  const allow = ["https://admin.lynia.example"];

  it("allows a request with no Origin (native mobile / server-to-server)", () => {
    expect(isOriginAllowed(undefined, allow)).toBe(true);
    expect(isOriginAllowed("", allow)).toBe(true);
  });

  it("allows an explicitly listed browser origin", () => {
    expect(isOriginAllowed("https://admin.lynia.example", allow)).toBe(true);
  });

  it("refuses an unlisted origin", () => {
    expect(isOriginAllowed("https://evil.example", allow)).toBe(false);
  });

  it("denies all cross-origin when the list is empty (default-deny, not wildcard)", () => {
    expect(isOriginAllowed("https://anything.example", [])).toBe(false);
    // …but still lets originless native clients through.
    expect(isOriginAllowed(undefined, [])).toBe(true);
  });
});

describe("corsOriginResolver", () => {
  it("resolves (null, true/false) without throwing — the shape enableCors/Socket.IO expect", () => {
    const resolve = corsOriginResolver(["https://ok.example"]);
    const seen: Array<[Error | null, boolean | undefined]> = [];
    resolve("https://ok.example", (e, a) => seen.push([e, a]));
    resolve("https://no.example", (e, a) => seen.push([e, a]));
    resolve(undefined, (e, a) => seen.push([e, a]));
    expect(seen).toEqual([
      [null, true],
      [null, false],
      [null, true],
    ]);
  });
});
