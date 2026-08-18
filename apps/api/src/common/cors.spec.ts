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

  // OPS-CORS-01: the allow-list is written by a human (a repo Variable, a `gcloud run deploy
  // --set-env-vars`), and the two things a human naturally pastes — an address-bar URL with its
  // trailing slash, a host with capitals — are NOT what a browser puts in the `Origin` header.
  // Unnormalised, such an entry denies every request while looking correct in the console.
  it("normalises a pasted address-bar entry to the origin a browser actually sends", () => {
    expect(parseAllowedOrigins("https://Kitchen.Example.com/")).toEqual(["https://kitchen.example.com"]);
    expect(parseAllowedOrigins("https://a.example.com///")).toEqual(["https://a.example.com"]);
  });

  it("keeps the port, which is part of the origin", () => {
    expect(parseAllowedOrigins("http://localhost:3001/")).toEqual(["http://localhost:3001"]);
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

  it("matches a trailing-slash/mixed-case list entry against the real Origin header", () => {
    expect(isOriginAllowed("https://admin.lynia.example", parseAllowedOrigins("https://Admin.Lynia.Example/"))).toBe(
      true,
    );
  });

  // Normalisation must not become a prefix match: a different host that merely starts with an
  // allow-listed one is still a different origin.
  it("does not let normalisation widen the list to a lookalike host", () => {
    expect(isOriginAllowed("https://admin.lynia.example.evil.com", allow)).toBe(false);
    expect(isOriginAllowed("http://admin.lynia.example", allow)).toBe(false); // scheme is part of the origin
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
