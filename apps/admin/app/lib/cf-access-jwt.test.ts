import { describe, expect, it, vi } from "vitest";
import { teamIssuer, verifyCfAccessAssertion, type CfAccessJwtVerifier } from "./cf-access-jwt";

/**
 * Cloudflare Access assertion verification (docs/AZURE-EXIT.md). Anything that is not a valid, correctly
 * audienced, correctly issued, unexpired assertion resolves to null (→ the policy 401s). The verifier is
 * injected so every branch runs with no network and no real keys.
 */

const TEAM = "lynia.cloudflareaccess.com";
const AUD = "4714c1358e65fe4b408ad6d432a5f878f08194bdb4752441fd56faefa9b2b6f2";

const okVerifier: CfAccessJwtVerifier = async (_assertion, teamDomain, audience) => {
  if (audience !== AUD || teamIssuer(teamDomain) !== `https://${TEAM}`) throw new Error("mismatch");
  return { iss: `https://${TEAM}`, aud: [audience], email: "owner@lyniago.com", sub: "u1" };
};

describe("teamIssuer", () => {
  it("normalises a team domain to its https issuer", () => {
    expect(teamIssuer("lynia.cloudflareaccess.com")).toBe("https://lynia.cloudflareaccess.com");
    expect(teamIssuer("https://Lynia.cloudflareaccess.com/")).toBe("https://lynia.cloudflareaccess.com");
  });

  it("refuses anything that is not a Cloudflare Access team domain (no JWKS fetch elsewhere)", () => {
    for (const bad of ["evil.com", "lynia.cloudflareaccess.com.evil.com", "a/b.cloudflareaccess.com", ""]) {
      expect(teamIssuer(bad)).toBeNull();
    }
  });
});

describe("verifyCfAccessAssertion", () => {
  it("returns the verified email on a good assertion", async () => {
    expect(await verifyCfAccessAssertion({ assertion: "good.jwt", teamDomain: TEAM, audience: AUD, verifier: okVerifier })).toBe(
      "owner@lyniago.com",
    );
  });

  it("fails closed without an assertion, team domain or audience — and never verifies", async () => {
    const spy = vi.fn<CfAccessJwtVerifier>();
    expect(await verifyCfAccessAssertion({ assertion: null, teamDomain: TEAM, audience: AUD, verifier: spy })).toBeNull();
    expect(await verifyCfAccessAssertion({ assertion: "x", teamDomain: "", audience: AUD, verifier: spy })).toBeNull();
    expect(await verifyCfAccessAssertion({ assertion: "x", teamDomain: "evil.com", audience: AUD, verifier: spy })).toBeNull();
    expect(await verifyCfAccessAssertion({ assertion: "x", teamDomain: TEAM, audience: " ", verifier: spy })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed when verification throws (bad signature, expired, wrong aud/iss)", async () => {
    const throwing: CfAccessJwtVerifier = async () => {
      throw new Error("signature verification failed");
    };
    expect(await verifyCfAccessAssertion({ assertion: "tampered", teamDomain: TEAM, audience: AUD, verifier: throwing })).toBeNull();
    expect(await verifyCfAccessAssertion({ assertion: "good.jwt", teamDomain: TEAM, audience: "other", verifier: okVerifier })).toBeNull();
  });

  it("fails closed when the verified payload has no usable email", async () => {
    const noEmail: CfAccessJwtVerifier = async () => ({ sub: "service-token" });
    const blank: CfAccessJwtVerifier = async () => ({ email: "  " });
    expect(await verifyCfAccessAssertion({ assertion: "a", teamDomain: TEAM, audience: AUD, verifier: noEmail })).toBeNull();
    expect(await verifyCfAccessAssertion({ assertion: "a", teamDomain: TEAM, audience: AUD, verifier: blank })).toBeNull();
  });
});
