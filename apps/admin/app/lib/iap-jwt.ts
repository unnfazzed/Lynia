/**
 * IAP assertion verification (plan Phase 1c; eng-review #3).
 *
 * GCP Identity-Aware Proxy sets TWO headers on every request it lets through:
 *   - `x-goog-authenticated-user-email` — a plaintext email (convenient, but forgeable by anyone who
 *     can reach the backend directly if ingress is ever misconfigured).
 *   - `x-goog-iap-jwt-assertion`         — a SIGNED JWT (ES256) whose `email` claim is the operator.
 *
 * The console can ban riders and record cash, so we do not trust the plaintext header alone. We verify
 * the signed assertion's signature (against IAP's public JWKS), issuer, and audience, and derive the
 * operator from the VERIFIED `email` claim. This makes operator identity unforgeable even if the Cloud
 * Run ingress lockdown is ever bypassed — defense in depth, not a single control.
 *
 * The crypto is isolated here and the JWKS verifier is injectable, so the branching logic is
 * unit-testable with a fake verifier and never touches the network in tests. `jose` is Edge-runtime
 * compatible (Next middleware runs on the Edge runtime).
 *
 * References:
 *   - IAP JWT verification: https://cloud.google.com/iap/docs/signed-headers-howto
 *   - Public keys (JWK):    https://www.gstatic.com/iap/verify/public_key-jwk
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/** IAP's public keys in JWK format (ES256). */
const IAP_JWKS_URL = new URL("https://www.gstatic.com/iap/verify/public_key-jwk");
/** The fixed issuer IAP stamps on every assertion. */
export const IAP_ISSUER = "https://cloud.google.com/iap";

/**
 * A verifier resolves+validates an assertion against an expected audience and returns its payload.
 * Injectable so tests can assert the branching (valid / expired / wrong-aud / bad-sig / missing) with
 * no network and no real keys.
 */
export type IapJwtVerifier = (assertion: string, audience: string) => Promise<JWTPayload>;

// Lazily created and cached across invocations — createRemoteJWKSet keeps its own key cache with
// rotation, so we build it once per module (per Edge isolate) rather than per request.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function jwks(): ReturnType<typeof createRemoteJWKSet> {
  return (cachedJwks ??= createRemoteJWKSet(IAP_JWKS_URL));
}

/** Default production verifier: verify signature via IAP JWKS, pinning ALGORITHM + issuer + audience.
 *  Pinning `algorithms: ["ES256"]` (the only algorithm IAP signs with) rejects an assertion that tries
 *  to downgrade to a different alg; `clockTolerance` absorbs small clock skew between IAP and Cloud Run
 *  so a valid assertion isn't spuriously rejected as expired/not-yet-valid. */
const defaultVerifier: IapJwtVerifier = async (assertion, audience) => {
  const { payload } = await jwtVerify(assertion, jwks(), {
    algorithms: ["ES256"],
    issuer: IAP_ISSUER,
    audience,
    clockTolerance: "30s",
  });
  return payload;
};

export interface VerifyIapAssertionInput {
  /** The raw `x-goog-iap-jwt-assertion` header value (null/absent when IAP didn't set it). */
  assertion: string | null | undefined;
  /**
   * Expected audience: `/projects/<PROJECT_NUMBER>/global/backendServices/<BACKEND_SERVICE_ID>` for a
   * global external LB backend (ADMIN_CONSOLE_IAP_AUDIENCE). Verification fails closed if this is unset.
   */
  audience: string | null | undefined;
  /** Override the verifier in tests. Defaults to the JWKS-backed production verifier. */
  verifier?: IapJwtVerifier;
}

/**
 * Verify an IAP assertion and return the operator email, or null on ANY failure (missing header,
 * missing audience, bad signature, wrong issuer/audience, expired, or a payload without a usable
 * `email`). Fails closed — a null return means "no trusted operator", which the policy turns into 401.
 */
export async function verifyIapAssertion(input: VerifyIapAssertionInput): Promise<string | null> {
  const { assertion, audience } = input;
  if (!assertion || assertion.trim() === "") return null;
  if (!audience || audience.trim() === "") return null;

  try {
    const payload = await (input.verifier ?? defaultVerifier)(assertion, audience);
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    return email !== "" ? email : null;
  } catch {
    // Any verification error (bad signature, expired, wrong aud/iss, malformed) → no trusted operator.
    return null;
  }
}
