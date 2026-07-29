import { describe, expect, it } from "vitest";
import { isAccessTokenStale, parseMerchantSession, serializeMerchantSession, type MerchantSession } from "./session";

const SESSION: MerchantSession = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresIn: 900,
  issuedAt: 1_000_000,
  profileId: "p1",
  role: "merchant",
};

describe("parseMerchantSession", () => {
  it("round-trips a serialized session", () => {
    expect(parseMerchantSession(serializeMerchantSession(SESSION))).toEqual(SESSION);
  });

  it("returns null for a missing/empty value", () => {
    expect(parseMerchantSession(undefined)).toBeNull();
    expect(parseMerchantSession(null)).toBeNull();
    expect(parseMerchantSession("")).toBeNull();
  });

  it("returns null (never throws) for malformed JSON", () => {
    expect(parseMerchantSession("{not json")).toBeNull();
  });

  it("returns null for a value missing required fields", () => {
    expect(parseMerchantSession(JSON.stringify({ accessToken: "a" }))).toBeNull();
  });

  it("returns null for a value with wrong field types", () => {
    expect(parseMerchantSession(JSON.stringify({ ...SESSION, expiresIn: "900" }))).toBeNull();
  });
});

describe("isAccessTokenStale", () => {
  it("is false before the token's own claimed lifetime elapses", () => {
    expect(isAccessTokenStale(SESSION, SESSION.issuedAt + SESSION.expiresIn * 1000 - 1)).toBe(false);
  });

  it("is true at or after the token's claimed expiry", () => {
    expect(isAccessTokenStale(SESSION, SESSION.issuedAt + SESSION.expiresIn * 1000)).toBe(true);
    expect(isAccessTokenStale(SESSION, SESSION.issuedAt + SESSION.expiresIn * 1000 + 1)).toBe(true);
  });
});
