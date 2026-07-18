import { describe, expect, it, vi } from "vitest";
import { IAP_ISSUER, verifyIapAssertion, type IapJwtVerifier } from "./iap-jwt";

/**
 * IAP assertion verification (eng-review #3). The operator identity must come from a cryptographically
 * verified assertion, not a plaintext header — so anything that isn't a valid, correctly-audienced,
 * correctly-issued, unexpired signature resolves to null (→ the policy 401s). The JWKS verifier is
 * injected so these tests exercise every branch with no network and no real keys.
 */

const AUD = "/projects/123456789/global/backendServices/987654321";

/** A verifier that succeeds only for the expected audience and returns a fixed email claim. */
const okVerifier: IapJwtVerifier = async (_assertion, audience) => {
  if (audience !== AUD) throw new Error("aud mismatch");
  return { iss: IAP_ISSUER, aud: audience, email: "alice@corp.com", sub: "123" };
};

describe("verifyIapAssertion", () => {
  it("returns the verified email on a good assertion", async () => {
    const email = await verifyIapAssertion({ assertion: "good.jwt.token", audience: AUD, verifier: okVerifier });
    expect(email).toBe("alice@corp.com");
  });

  it("fails closed when the assertion header is missing or blank", async () => {
    const spy = vi.fn<IapJwtVerifier>();
    expect(await verifyIapAssertion({ assertion: null, audience: AUD, verifier: spy })).toBeNull();
    expect(await verifyIapAssertion({ assertion: "   ", audience: AUD, verifier: spy })).toBeNull();
    // Never even attempts verification without an assertion to verify.
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed when no audience is configured", async () => {
    const spy = vi.fn<IapJwtVerifier>();
    expect(await verifyIapAssertion({ assertion: "good.jwt.token", audience: undefined, verifier: spy })).toBeNull();
    expect(await verifyIapAssertion({ assertion: "good.jwt.token", audience: "", verifier: spy })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("fails closed on a bad signature / malformed token (verifier throws)", async () => {
    const throwing: IapJwtVerifier = async () => {
      throw new Error("signature verification failed");
    };
    expect(await verifyIapAssertion({ assertion: "tampered", audience: AUD, verifier: throwing })).toBeNull();
  });

  it("fails closed on the wrong audience (verifier rejects it)", async () => {
    const email = await verifyIapAssertion({
      assertion: "good.jwt.token",
      audience: "/projects/123456789/global/backendServices/DIFFERENT",
      verifier: okVerifier,
    });
    expect(email).toBeNull();
  });

  it("fails closed when the verified payload has no usable email claim", async () => {
    const noEmail: IapJwtVerifier = async (_a, audience) => ({ iss: IAP_ISSUER, aud: audience, sub: "123" });
    const blankEmail: IapJwtVerifier = async (_a, audience) => ({
      iss: IAP_ISSUER,
      aud: audience,
      email: "   ",
      sub: "123",
    });
    expect(await verifyIapAssertion({ assertion: "x", audience: AUD, verifier: noEmail })).toBeNull();
    expect(await verifyIapAssertion({ assertion: "x", audience: AUD, verifier: blankEmail })).toBeNull();
  });
});
