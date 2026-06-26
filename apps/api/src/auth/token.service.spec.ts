import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { TokenService } from "./token.service";

const env = { JWT_SIGNING_SECRET: "test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env;
const tokens = new TokenService(env);

describe("TokenService", () => {
  it("signs and verifies an access token round-trip", () => {
    const token = tokens.signAccess("profile-1", "rider");
    const claims = tokens.verifyAccess(token);
    expect(claims).toEqual({ sub: "profile-1", role: "rider" });
  });

  it("rejects a token signed with a different secret", () => {
    const other = new TokenService({ ...env, JWT_SIGNING_SECRET: "another-secret-0123456789" } as Env);
    const token = other.signAccess("x", "customer");
    expect(() => tokens.verifyAccess(token)).toThrow();
  });

  it("hashes deterministically and compares in constant time", () => {
    const a = tokens.hash("123456");
    expect(tokens.hash("123456")).toBe(a);
    expect(tokens.hash("000000")).not.toBe(a);
    expect(tokens.safeEqualHex(a, tokens.hash("123456"))).toBe(true);
    expect(tokens.safeEqualHex(a, tokens.hash("000000"))).toBe(false);
  });

  it("generates a 6-digit OTP", () => {
    for (let i = 0; i < 50; i++) expect(tokens.randomOtp()).toMatch(/^\d{6}$/);
  });
});
