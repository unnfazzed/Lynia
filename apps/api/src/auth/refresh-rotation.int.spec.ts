/**
 * Refresh-token rotation against a real Postgres (needs DATABASE_URL). The unit spec drives the rules
 * through a fake; this proves the parts only a database can: that rotation's revoke + mint + link is one
 * transaction under real row locks, so concurrent refreshes of one token converge on ONE successor, and
 * that a client which never received a rotate response can re-present its old token and get that same
 * successor back — the lost-response case that used to sign users out after 60s and send them back
 * through OTP.
 */
import { randomUUID } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PiiCryptoService } from "../common/pii-crypto.service";
import type { Env } from "../config/env";
import type { KycPendingStateService } from "../kyc/kyc-pending-state.service";
import type { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { ConsoleOtpSender } from "./otp-sender";
import { InMemoryOtpStore } from "./otp-store";
import { TokenService } from "./token.service";

const env = {
  NODE_ENV: "test",
  JWT_SIGNING_SECRET: "int-test-secret-0123456789",
  ACCESS_TTL_SECONDS: 900,
  REFRESH_TTL_SECONDS: 31_536_000,
  SESSION_RETENTION_DAYS: 30,
} as Env;

const prisma = new PrismaService();
const tokens = new TokenService(env);
// Only Prisma is real: refresh()/logout() touch nothing else.
const auth = new AuthService(
  env,
  prisma,
  tokens,
  new InMemoryOtpStore(),
  new ConsoleOtpSender(),
  {} as MetricsService,
  new PiiCryptoService({ PII_ENCRYPTION_KEY: "int-test-pii-key-0123456789abcdef" } as Env),
  {} as KycPendingStateService,
);

const PHONE_PREFIX = "authint_";

/** A signed-in customer: a profile plus one live session whose refresh token the "client" holds. */
async function signedIn(): Promise<{ profileId: string; token: string }> {
  const profile = await prisma.profile.create({
    data: { role: "customer", firstName: "Tendai", lastName: "M", phone: `${PHONE_PREFIX}${randomUUID()}` },
    select: { id: true },
  });
  const secret = tokens.randomToken();
  const session = await prisma.session.create({
    data: { profileId: profile.id, refreshTokenHash: tokens.hash(secret), expiresAt: new Date(Date.now() + 86_400_000) },
    select: { id: true },
  });
  return { profileId: profile.id, token: `${session.id}.${secret}` };
}

const sessionsOf = (profileId: string) => prisma.session.findMany({ where: { profileId }, orderBy: { createdAt: "asc" } });

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await prisma.profile.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } }); // sessions cascade
  await prisma.$disconnect();
});

describe("refresh rotation (Postgres)", () => {
  it("a rotate response lost in flight: re-presenting the old token returns the SAME successor, minting nothing", async () => {
    const { profileId, token } = await signedIn();
    const first = await auth.refresh(token); // the client never receives this

    const retry = await auth.refresh(token);
    expect(retry.refreshToken).toBe(first.refreshToken);
    const rows = await sessionsOf(profileId);
    expect(rows).toHaveLength(2); // the original (rotated) + one successor — never a third
    expect(rows[0]).toMatchObject({ revokedAt: expect.any(Date), rotatedToId: rows[1]!.id });
    expect(rows[1]!.revokedAt).toBeNull();
  });

  it("…still answered long after the old 60s grace — the phone was off for a day", async () => {
    const { token } = await signedIn();
    const first = await auth.refresh(token);
    await prisma.session.update({
      where: { id: token.slice(0, token.indexOf(".")) },
      data: { revokedAt: new Date(Date.now() - 24 * 3_600_000) },
    });

    await expect(auth.refresh(token)).resolves.toMatchObject({ refreshToken: first.refreshToken });
  });

  it("concurrent refreshes of one token converge on ONE successor — no 401, no forked sessions", async () => {
    const { profileId, token } = await signedIn();

    // A client timing out and retrying while its first refresh is still running, a relaunch racing the
    // killed process's in-flight request, two browser tabs: all present the same token at once.
    const results = await Promise.all(Array.from({ length: 6 }, () => auth.refresh(token)));

    expect(new Set(results.map((r) => r.refreshToken)).size).toBe(1);
    expect(await sessionsOf(profileId)).toHaveLength(2);
  });

  it("once the client uses the successor, the old token is dead (reuse detection intact)", async () => {
    const { token } = await signedIn();
    const successor = await auth.refresh(token);
    const next = await auth.refresh(successor.refreshToken);

    expect(next.refreshToken).not.toBe(successor.refreshToken);
    await expect(auth.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("logout with an already-rotated session id revokes the live head — and kills the replay", async () => {
    const { profileId, token } = await signedIn();
    const live = await auth.refresh(token);

    await expect(auth.logout(token.slice(0, token.indexOf(".")), profileId)).resolves.toEqual({ revoked: true });
    expect((await sessionsOf(profileId)).every((s) => s.revokedAt !== null)).toBe(true);
    await expect(auth.refresh(live.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.refresh(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
