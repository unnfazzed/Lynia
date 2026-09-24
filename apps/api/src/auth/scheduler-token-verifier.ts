import { OAuth2Client } from "google-auth-library";
import type { JWTVerifyGetKey } from "jose" with { "resolution-mode": "import" };
import type { Env } from "../config/env";

/** The request fields a scheduler verifier reads (and `user`, which it sets on success). */
export interface SchedulerRequest {
  headers: Record<string, string | undefined>;
  method?: string;
  url?: string;
  originalUrl?: string;
  protocol?: string;
  hostname?: string;
  user?: { sub: string; role: string };
}

/** One way of proving "this bearer token is our cron job" (plan C3 / E15). `SCHEDULER_AUTH` picks
 *  the implementation; the guard stays a two-step "admin JWT, else scheduler" check either way.
 *  Returns false for anything it can't verify — it never throws. On success it sets `req.user`. */
export interface SchedulerTokenVerifier {
  verify(token: string, req: SchedulerRequest): Promise<boolean>;
}

const pathOf = (req: SchedulerRequest): string => (req.originalUrl ?? req.url ?? "").split("?")[0];

/** Cloud Scheduler's Google-signed OIDC identity token (GCP). Honoured only when
 *  SCHEDULER_SERVICE_ACCOUNT is configured, the token verifies against Google's certs, the
 *  service-account email matches exactly, and the token's audience is this route's own full URL
 *  (scheme + host + path) — so a token minted for one endpoint, or for the same path on a
 *  different host, can never be replayed against another. Trusting `req.protocol`/`req.hostname`
 *  here is safe because `TRUST_PROXY` pins Express to the single documented ALB→Cloud Run hop
 *  (see config/env.ts). */
export class GoogleOidcVerifier implements SchedulerTokenVerifier {
  constructor(
    private readonly allowed: string | undefined,
    /** Test seam: specs pass a stub verifier. */
    private readonly oidcClient: Pick<OAuth2Client, "verifyIdToken"> = new OAuth2Client(),
  ) {}

  async verify(token: string, req: SchedulerRequest): Promise<boolean> {
    const allowed = this.allowed;
    if (!allowed) return false;
    try {
      // No audience arg: signature/expiry/issuer are verified here, audience is pinned below
      // to the request's own full URL (the scheduler mints its token with audience = the job URI).
      const ticket = await this.oidcClient.verifyIdToken({ idToken: token });
      const claims = ticket.getPayload();
      if (!claims || claims.email !== allowed || claims.email_verified !== true) return false;
      const path = pathOf(req);
      if (typeof claims.aud !== "string" || !path) return false;
      const aud = new URL(claims.aud);
      const expectedOrigin = `${req.protocol ?? "https"}://${req.hostname ?? ""}`;
      if (aud.pathname !== path || aud.origin !== expectedOrigin) return false;
      req.user = { sub: `scheduler:${allowed}`, role: "admin" };
      return true;
    } catch {
      return false; // not a valid Google-signed token (or an audience that isn't a URL)
    }
  }
}

/** The only routes a scheduler token may call on Azure (method + exact path). Entra's `aud` names
 *  the app registration, not a URL, so — unlike the Google path — the token can't bind a route; this
 *  allowlist is the mitigation (plan §5a C3). It must match the scheduled jobs: the retention sweep
 *  (privacy.controller.ts) and the wallet integrity check (wallet-integrity.controller.ts). */
export const ENTRA_SCHEDULER_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "POST", path: "/admin/retention/purge" },
  { method: "POST", path: "/admin/wallet/integrity-check" },
];

/** The app role the cron identity is assigned on the scheduler app registration (plan S2). */
export const SCHEDULER_APP_ROLE = "Scheduler.Invoke";

export interface EntraVerifierConfig {
  tenantId: string;
  audience: string;
  principalId: string;
}

/** An Entra ID managed-identity access token (Azure Container Apps scheduled jobs). Verified
 *  against the tenant's JWKS, then every claim is pinned: `iss` (v1 or v2 form for the tenant),
 *  `tid`, `aud` (the scheduler app's ID URI), `oid` (the cron job's identity — the real
 *  authorization, since ANY principal in the tenant can mint a token for this `aud`), and the
 *  `Scheduler.Invoke` app role (defence in depth if `oid` is ever misconfigured; plan S2). */
export class EntraVerifier implements SchedulerTokenVerifier {
  constructor(
    private readonly config: EntraVerifierConfig,
    /** Test seam: specs pass a local key resolver. Defaults to the tenant's remote JWKS (cached). */
    private keys?: JWTVerifyGetKey,
  ) {}

  async verify(token: string, req: SchedulerRequest): Promise<boolean> {
    const method = (req.method ?? "").toUpperCase();
    const path = pathOf(req);
    if (!ENTRA_SCHEDULER_ROUTES.some((r) => r.method === method && r.path === path)) return false;
    const { tenantId, audience, principalId } = this.config;
    if (!tenantId || !audience || !principalId) return false; // fail closed on incomplete config
    try {
      // jose is ESM-only; this CommonJS build loads it through a dynamic import.
      const { jwtVerify, createRemoteJWKSet } = await import("jose");
      this.keys ??= createRemoteJWKSet(
        new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
      );
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: [`https://sts.windows.net/${tenantId}/`, `https://login.microsoftonline.com/${tenantId}/v2.0`],
        audience,
        algorithms: ["RS256"],
      });
      if (payload.tid !== tenantId || payload.oid !== principalId) return false;
      const roles = payload.roles;
      if (!Array.isArray(roles) || !roles.includes(SCHEDULER_APP_ROLE)) return false;
      req.user = { sub: `scheduler:${principalId}`, role: "admin" };
      return true;
    } catch {
      return false; // bad signature, expired, wrong issuer/audience, or JWKS unreachable
    }
  }
}

/** The verifier `SCHEDULER_AUTH` selects. The env boot-guard guarantees the azure config is complete. */
export function schedulerVerifierFor(env: Env): SchedulerTokenVerifier {
  if (env.SCHEDULER_AUTH === "azure") {
    return new EntraVerifier({
      tenantId: env.SCHEDULER_TENANT_ID ?? "",
      audience: env.SCHEDULER_AUDIENCE ?? "",
      principalId: env.SCHEDULER_PRINCIPAL_ID ?? "",
    });
  }
  return new GoogleOidcVerifier(env.SCHEDULER_SERVICE_ACCOUNT);
}
