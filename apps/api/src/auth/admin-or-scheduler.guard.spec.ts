import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { AdminOrSchedulerGuard } from "./admin-or-scheduler.guard";
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
  url?: string;
  user?: { sub: string; role: string };
}

const ctxFor = (req: FakeRequest): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => req }) }) as unknown as ExecutionContext;

const PURGE_URL = "/admin/retention/purge";

/** Build a guard whose Google-verification step is stubbed to yield `claims` (or reject). */
function guardWith(claims: Record<string, unknown> | Error | null, guardEnv: Env = env): AdminOrSchedulerGuard {
  const guard = new AdminOrSchedulerGuard(tokens, guardEnv);
  guard.oidcClient = {
    verifyIdToken: async () => {
      if (claims instanceof Error) throw claims;
      return { getPayload: () => claims } as never;
    },
  };
  return guard;
}

const schedulerClaims = {
  email: SCHEDULER_SA,
  email_verified: true,
  aud: `https://lyniago.lyniafinance.com${PURGE_URL}`,
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
    const req: FakeRequest = { headers: { authorization: "Bearer google-oidc" }, url: PURGE_URL };
    await expect(guardWith(schedulerClaims).canActivate(ctxFor(req))).resolves.toBe(true);
    expect(req.user).toEqual({ sub: `scheduler:${SCHEDULER_SA}`, role: "admin" });
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
