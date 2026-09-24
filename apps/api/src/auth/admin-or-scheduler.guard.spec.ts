import type { ExecutionContext } from "@nestjs/common";
import type { JWTPayload, JWTVerifyGetKey } from "jose" with { "resolution-mode": "import" };
import { beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { AdminOrSchedulerGuard } from "./admin-or-scheduler.guard";
import { EntraVerifier, GoogleOidcVerifier } from "./scheduler-token-verifier";
import { TokenService } from "./token.service";

const SCHEDULER_SA = "lynia-run@lynia-500911.iam.gserviceaccount.com";
const env = {
  JWT_SIGNING_SECRET: "test-secret-0123456789",
  ACCESS_TTL_SECONDS: 900,
  SCHEDULER_SERVICE_ACCOUNT: SCHEDULER_SA,
} as Env;
const tokens = new TokenService(env);

interface FakeRequest {
  headers: Record<string, string | undefined>;
  method?: string;
  url?: string;
  protocol?: string;
  hostname?: string;
  user?: { sub: string; role: string };
}

const ctxFor = (req: FakeRequest): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const PURGE_URL = "/admin/retention/purge";
const HOST = "lyniago.lyniafinance.com";
const onHost = (req: Omit<FakeRequest, "protocol" | "hostname">): FakeRequest => ({
  ...req,
  protocol: "https",
  hostname: HOST,
});

/** Build a guard whose Google-verification step is stubbed to yield `claims` (or reject). */
function guardWith(claims: Record<string, unknown> | Error | null, guardEnv: Env = env): AdminOrSchedulerGuard {
  const guard = new AdminOrSchedulerGuard(tokens, guardEnv);
  guard.verifier = new GoogleOidcVerifier(guardEnv.SCHEDULER_SERVICE_ACCOUNT, {
    verifyIdToken: async () => {
      if (claims instanceof Error) throw claims;
      return { getPayload: () => claims } as never;
    },
  });
  return guard;
}

const schedulerClaims = {
  email: SCHEDULER_SA,
  email_verified: true,
  aud: `https://${HOST}${PURGE_URL}`,
};

describe("AdminOrSchedulerGuard", () => {
  it("accepts an admin app JWT (console path)", async () => {
    const req: FakeRequest = {
      headers: { authorization: `Bearer ${tokens.signAccess("admin-1", "admin")}` },
      url: PURGE_URL,
    };
    await expect(guardWith(null).canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.user).toEqual({ sub: "admin-1", role: "admin" });
  });

  it("403s a VALID non-admin app JWT without falling through to the OIDC path", async () => {
    // Even with a verifier that would accept anything, a real customer token must stay a 403.
    const req: FakeRequest = {
      headers: { authorization: `Bearer ${tokens.signAccess("cust-1", "customer")}` },
      url: PURGE_URL,
    };
    await expect(guardWith(schedulerClaims).canActivate(ctxFor(req))).rejects.toThrow("Admin only");
  });

  it("accepts the scheduler's Google OIDC token (email + verified + audience all match)", async () => {
    const req = onHost({ headers: { authorization: "Bearer google-oidc" }, url: PURGE_URL });
    await expect(guardWith(schedulerClaims).canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.user).toEqual({ sub: `scheduler:${SCHEDULER_SA}`, role: "admin" });
  });

  it("rejects an OIDC token whose audience host doesn't match this request's host (cross-host replay)", async () => {
    // Same path, correct SA, but minted for a different scheme/host — a bare pathname compare would
    // have let this through even though the audience never named THIS deployment's origin.
    const req = onHost({ headers: { authorization: "Bearer google-oidc" }, url: PURGE_URL });
    const claims = { ...schedulerClaims, aud: `https://evil.example.com${PURGE_URL}` };
    await expect(guardWith(claims).canActivate(ctxFor(req))).rejects.toThrow("Invalid or expired token");
  });

  it("rejects an OIDC token from a different service account", async () => {
    const req: FakeRequest = { headers: { authorization: "Bearer google-oidc" }, url: PURGE_URL };
    const claims = { ...schedulerClaims, email: "attacker@evil-project.iam.gserviceaccount.com" };
    await expect(guardWith(claims).canActivate(ctxFor(req))).rejects.toThrow("Invalid or expired token");
  });

  it("rejects an OIDC token whose email is unverified", async () => {
    const req: FakeRequest = { headers: { authorization: "Bearer google-oidc" }, url: PURGE_URL };
    const claims = { ...schedulerClaims, email_verified: false };
    await expect(guardWith(claims).canActivate(ctxFor(req))).rejects.toThrow("Invalid or expired token");
  });

  it("rejects an OIDC token minted for a different route (audience replay)", async () => {
    const req: FakeRequest = { headers: { authorization: "Bearer google-oidc" }, url: PURGE_URL };
    const claims = { ...schedulerClaims, aud: "https://lyniago.lyniafinance.com/admin/cash/settlements/auto-pause" };
    await expect(guardWith(claims).canActivate(ctxFor(req))).rejects.toThrow("Invalid or expired token");
  });

  it("rejects an OIDC token whose audience is not a URL", async () => {
    const req: FakeRequest = { headers: { authorization: "Bearer google-oidc" }, url: PURGE_URL };
    const claims = { ...schedulerClaims, aud: "407250490173" };
    await expect(guardWith(claims).canActivate(ctxFor(req))).rejects.toThrow("Invalid or expired token");
  });

  it("rejects when Google-side verification fails outright", async () => {
    const req: FakeRequest = { headers: { authorization: "Bearer forged" }, url: PURGE_URL };
    await expect(guardWith(new Error("bad signature")).canActivate(ctxFor(req))).rejects.toThrow(
      "Invalid or expired token",
    );
  });

  it("keeps the OIDC path OFF when SCHEDULER_SERVICE_ACCOUNT is unset", async () => {
    const off = { ...env, SCHEDULER_SERVICE_ACCOUNT: undefined } as Env;
    const req: FakeRequest = { headers: { authorization: "Bearer google-oidc" }, url: PURGE_URL };
    // Verifier would accept — but the env switch must win.
    await expect(guardWith(schedulerClaims, off).canActivate(ctxFor(req))).rejects.toThrow(
      "Invalid or expired token",
    );
  });

  it("401s a missing bearer header", async () => {
    const req: FakeRequest = { headers: {}, url: PURGE_URL };
    await expect(guardWith(schedulerClaims).canActivate(ctxFor(req))).rejects.toThrow("Missing bearer token");
  });
});

describe("AdminOrSchedulerGuard — SCHEDULER_AUTH selects the verifier", () => {
  it("defaults to the Google OIDC verifier", () => {
    expect(new AdminOrSchedulerGuard(tokens, env).verifier).toBeInstanceOf(GoogleOidcVerifier);
  });

  it("uses the Entra verifier when SCHEDULER_AUTH=azure", () => {
    const azure = { ...env, SCHEDULER_AUTH: "azure" } as Env;
    expect(new AdminOrSchedulerGuard(tokens, azure).verifier).toBeInstanceOf(EntraVerifier);
  });
});

// Entra managed-identity tokens (plan C3 / S2). A local RSA keypair signs the tokens and a local
// JWKS resolves the key, so nothing here touches the network.
describe("AdminOrSchedulerGuard — Entra managed-identity verifier", () => {
  const TENANT = "3f1c6a8e-2b4d-4e6f-9a1b-7c8d9e0f1a2b";
  const OTHER_TENANT = "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b";
  const AUDIENCE = "api://lynia-scheduler";
  const CRON_OID = "5b2e8f1a-6c3d-4a7e-b9f0-1d2c3b4a5e6f";
  const OTHER_MI_OID = "7a6b5c4d-3e2f-4a1b-8c9d-0e1f2a3b4c5d";
  const V1_ISS = `https://sts.windows.net/${TENANT}/`;
  const V2_ISS = `https://login.microsoftonline.com/${TENANT}/v2.0`;
  const WALLET_URL = "/admin/wallet/integrity-check";
  const azureEnv = {
    ...env,
    SCHEDULER_AUTH: "azure",
    SCHEDULER_TENANT_ID: TENANT,
    SCHEDULER_AUDIENCE: AUDIENCE,
    SCHEDULER_PRINCIPAL_ID: CRON_OID,
  } as Env;

  let sign: (claims: JWTPayload, key?: "trusted" | "rogue") => Promise<string>;
  let keys: JWTVerifyGetKey;

  beforeAll(async () => {
    const { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } = await import("jose");
    const trusted = await generateKeyPair("RS256");
    const rogue = await generateKeyPair("RS256");
    keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(trusted.publicKey)), kid: "k1", alg: "RS256" }] });
    sign = (claims, key = "trusted") =>
      new SignJWT({ exp: Math.floor(Date.now() / 1000) + 300, ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuedAt()
        .sign(key === "trusted" ? trusted.privateKey : rogue.privateKey);
  });

  const cronClaims = (): JWTPayload => ({
    iss: V1_ISS,
    tid: TENANT,
    aud: AUDIENCE,
    oid: CRON_OID,
    roles: ["Scheduler.Invoke"],
  });

  const entraGuard = (): AdminOrSchedulerGuard => {
    const guard = new AdminOrSchedulerGuard(tokens, azureEnv);
    guard.verifier = new EntraVerifier(
      { tenantId: TENANT, audience: AUDIENCE, principalId: CRON_OID },
      keys,
    );
    return guard;
  };

  const call = async (token: string, method = "POST", url = PURGE_URL): Promise<FakeRequest> => {
    const req: FakeRequest = { headers: { authorization: `Bearer ${token}` }, method, url };
    await entraGuard().canActivate(ctxFor(req));
    return req;
  };

  it("accepts the cron identity's v1 token (sts.windows.net issuer) on the retention purge", async () => {
    const req = await call(await sign(cronClaims()));
    expect(req.user).toEqual({ sub: `scheduler:${CRON_OID}`, role: "admin" });
  });

  it("accepts the cron identity's v2 token (login.microsoftonline.com issuer) on the wallet integrity check", async () => {
    const req = await call(await sign({ ...cronClaims(), iss: V2_ISS }), "POST", WALLET_URL);
    expect(req.user).toEqual({ sub: `scheduler:${CRON_OID}`, role: "admin" });
  });

  it("ignores the query string when matching the route allowlist", async () => {
    await expect(call(await sign(cronClaims()), "POST", `${PURGE_URL}?dryRun=1`)).resolves.toBeDefined();
  });

  it.each<[string, JWTPayload]>([
    ["an issuer from another tenant", { iss: `https://sts.windows.net/${OTHER_TENANT}/` }],
    ["a non-Entra issuer", { iss: "https://accounts.google.com" }],
    ["a wrong tid", { tid: OTHER_TENANT }],
    ["a missing tid", { tid: undefined }],
    ["a wrong audience", { aud: "https://management.azure.com/" }],
    ["a wrong oid", { oid: "00000000-0000-4000-8000-000000000000" }],
    ["a missing oid", { oid: undefined }],
    ["no roles claim", { roles: undefined }],
    ["roles without Scheduler.Invoke", { roles: ["Reader"] }],
    ["a roles claim that is a string, not an array", { roles: "Scheduler.Invoke" }],
  ])("401s a token with %s", async (_label, override) => {
    const token = await sign({ ...cronClaims(), ...override });
    await expect(call(token)).rejects.toThrow("Invalid or expired token");
  });

  it("401s a token from another managed identity in the same tenant, even holding the app role (S2)", async () => {
    // Any principal in the tenant can mint a token for this aud; only the pinned oid is the cron job.
    const token = await sign({ ...cronClaims(), oid: OTHER_MI_OID });
    await expect(call(token)).rejects.toThrow("Invalid or expired token");
  });

  it("401s a token from another managed identity in the same tenant without the app role (S2)", async () => {
    const { roles: _roles, ...noRole } = cronClaims();
    const token = await sign({ ...noRole, oid: OTHER_MI_OID });
    await expect(call(token)).rejects.toThrow("Invalid or expired token");
  });

  it("401s a correctly-claimed token signed by a key outside the tenant's JWKS", async () => {
    await expect(call(await sign(cronClaims(), "rogue"))).rejects.toThrow("Invalid or expired token");
  });

  it("401s an expired token", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await sign({ ...cronClaims(), exp: past });
    await expect(call(token)).rejects.toThrow("Invalid or expired token");
  });

  it.each<[string, string]>([
    ["GET", PURGE_URL],
    ["POST", "/admin/cash/settlements/auto-pause"],
    ["POST", "/admin/users"],
    ["POST", `${PURGE_URL}/`],
    ["POST", "/admin/retention"],
  ])("401s the right token on a non-allowlisted route (%s %s)", async (method, url) => {
    await expect(call(await sign(cronClaims()), method, url)).rejects.toThrow("Invalid or expired token");
  });

  it("fails closed when the verifier's config is incomplete", async () => {
    const guard = new AdminOrSchedulerGuard(tokens, azureEnv);
    guard.verifier = new EntraVerifier({ tenantId: TENANT, audience: AUDIENCE, principalId: "" }, keys);
    const req: FakeRequest = { headers: { authorization: `Bearer ${await sign(cronClaims())}` }, method: "POST", url: PURGE_URL };
    await expect(guard.canActivate(ctxFor(req))).rejects.toThrow("Invalid or expired token");
  });

  it("does not accept a Google OIDC-shaped token on the azure path", async () => {
    const token = await sign({ ...cronClaims(), iss: "https://accounts.google.com", email: SCHEDULER_SA, email_verified: true });
    await expect(call(token)).rejects.toThrow("Invalid or expired token");
  });

  it("still accepts an admin app JWT and still 403s a non-admin one on the azure path", async () => {
    const admin: FakeRequest = { headers: { authorization: `Bearer ${tokens.signAccess("admin-1", "admin")}` }, method: "POST", url: PURGE_URL };
    await expect(entraGuard().canActivate(ctxFor(admin))).resolves.toBe(true);
    const cust: FakeRequest = { headers: { authorization: `Bearer ${tokens.signAccess("cust-1", "customer")}` }, method: "POST", url: PURGE_URL };
    await expect(entraGuard().canActivate(ctxFor(cust))).rejects.toThrow("Admin only");
  });
});
