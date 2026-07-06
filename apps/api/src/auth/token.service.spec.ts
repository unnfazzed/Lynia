import jwt from "jsonwebtoken";
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

  it("rejects an unsigned alg:none token (algorithm is pinned to HS256)", () => {
    // A classic algorithm-confusion attempt: forge claims with alg:none and no signature.
    const forged = jwt.sign({ role: "admin" }, "", { subject: "attacker", algorithm: "none" });
    expect(() => tokens.verifyAccess(forged)).toThrow();
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

describe("TokenService — zero-downtime secret rotation", () => {
  const current = "current-signing-secret-0123456789";
  const previous = "previous-signing-secret-9876543210";

  it("verifies a token signed with the PREVIOUS secret during a rotation window", () => {
    const oldSigner = new TokenService({ ...env, JWT_SIGNING_SECRET: previous } as Env);
    const oldToken = oldSigner.signAccess("p1", "customer");

    // New service: current secret signs, previous secret still accepted on verify.
    const rotating = new TokenService({
      ...env,
      JWT_SIGNING_SECRET: current,
      JWT_SIGNING_SECRET_PREVIOUS: previous,
    } as Env);
    expect(rotating.verifyAccess(oldToken)).toEqual({ sub: "p1", role: "customer" });

    // New tokens are signed with the current secret and also verify.
    const newToken = rotating.signAccess("p2", "rider");
    expect(rotating.verifyAccess(newToken)).toEqual({ sub: "p2", role: "rider" });
  });

  it("rejects a previous-secret token once the rotation window is closed (no PREVIOUS set)", () => {
    const oldSigner = new TokenService({ ...env, JWT_SIGNING_SECRET: previous } as Env);
    const oldToken = oldSigner.signAccess("p1", "customer");
    const afterRotation = new TokenService({ ...env, JWT_SIGNING_SECRET: current } as Env);
    expect(() => afterRotation.verifyAccess(oldToken)).toThrow();
  });
});

describe("TokenService — hash-key separation", () => {
  it("hashes with TOKEN_HASH_SECRET independently of the JWT signing secret", () => {
    const hashSecret = "dedicated-hash-secret-0123456789";
    const a = new TokenService({ ...env, JWT_SIGNING_SECRET: "jwt-a-0123456789", TOKEN_HASH_SECRET: hashSecret } as Env);
    const b = new TokenService({ ...env, JWT_SIGNING_SECRET: "jwt-b-9876543210", TOKEN_HASH_SECRET: hashSecret } as Env);
    // Rotating the JWT signing secret must NOT change the hash → stored refresh/OTP hashes survive.
    expect(a.hash("refresh-token-secret")).toBe(b.hash("refresh-token-secret"));
  });

  it("falls back to the JWT signing secret for hashing when TOKEN_HASH_SECRET is unset", () => {
    const withHashKey = new TokenService({ ...env, TOKEN_HASH_SECRET: env.JWT_SIGNING_SECRET } as Env);
    expect(withHashKey.hash("x")).toBe(tokens.hash("x")); // same effective key ⇒ same hash
  });
});
