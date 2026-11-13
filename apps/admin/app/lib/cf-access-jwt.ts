/**
 * Cloudflare Access assertion verification (docs/AZURE-EXIT.md: the console moves off Azure Easy Auth).
 *
 * When the console sits behind a Cloudflare Access application, Access signs every request it lets
 * through with `Cf-Access-Jwt-Assertion` (RS256) whose `email` claim is the operator. As with IAP, the
 * plaintext `Cf-Access-Authenticated-User-Email` header is NOT trusted: we verify the signature against
 * the team's JWKS, pin the issuer (the team domain) and the audience (the Access application's AUD tag),
 * and take the operator from the VERIFIED `email` claim. A request that reaches the server without going
 * through Access cannot forge an operator.
 *
 * References: https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export type CfAccessJwtVerifier = (assertion: string, teamDomain: string, audience: string) => Promise<JWTPayload>;

/** `lynia.cloudflareaccess.com` (with or without scheme / trailing slash) → `https://lynia.cloudflareaccess.com`. */
export function teamIssuer(teamDomain: string): string | null {
  const host = teamDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  // Only a Cloudflare Access team domain: refuse anything that would point the JWKS fetch elsewhere.
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(host)) return null;
  return `https://${host.toLowerCase()}`;
}

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwks(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  let set = jwksByIssuer.get(issuer);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByIssuer.set(issuer, set);
  }
  return set;
}

const defaultVerifier: CfAccessJwtVerifier = async (assertion, teamDomain, audience) => {
  const issuer = teamIssuer(teamDomain);
  if (!issuer) throw new Error("invalid Cloudflare Access team domain");
  const { payload } = await jwtVerify(assertion, jwks(issuer), {
    algorithms: ["RS256"],
    issuer,
    audience,
    clockTolerance: "30s",
  });
  return payload;
};

export interface VerifyCfAccessInput {
  /** Raw `cf-access-jwt-assertion` header (null when Access didn't set it). */
  assertion: string | null | undefined;
  /** ADMIN_CONSOLE_CF_ACCESS_TEAM_DOMAIN, e.g. `lynia.cloudflareaccess.com`. */
  teamDomain: string | null | undefined;
  /** ADMIN_CONSOLE_CF_ACCESS_AUD: the Access application's Audience (AUD) tag. */
  audience: string | null | undefined;
  verifier?: CfAccessJwtVerifier;
}

/**
 * The operator email from a verified Access assertion, or null on ANY failure (missing header or config,
 * bad signature, wrong issuer/audience, expired, no usable `email`). Fails closed: null → 401.
 */
export async function verifyCfAccessAssertion(input: VerifyCfAccessInput): Promise<string | null> {
  const { assertion, teamDomain, audience } = input;
  if (!assertion || assertion.trim() === "") return null;
  if (!teamDomain || !teamIssuer(teamDomain)) return null;
  if (!audience || audience.trim() === "") return null;
  try {
    const payload = await (input.verifier ?? defaultVerifier)(assertion, teamDomain, audience.trim());
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    return email !== "" ? email : null;
  } catch {
    return null;
  }
}
