import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService, type OtpVerifyResult } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { OTP_SENDER, type OtpSender } from "./otp-sender";
import { OTP_STORE, type OtpStore } from "./otp-store";
import { TokenService } from "./token.service";

const MAX_OTP_ATTEMPTS = 5;
// Per-phone / per-IP / global send caps (ET5: each send costs BSP money — enumeration is a budget-DoS).
const RL = {
  phone: { max: 5, windowSec: 3600 },
  ip: { max: 20, windowSec: 3600 },
  global: { max: 5000, windowSec: 86400 },
};

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Inject(OTP_STORE) private readonly store: OtpStore,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
    private readonly metrics: MetricsService,
  ) {}

  /** Full profile for the authenticated caller (GET /auth/me) — adds the rider record when present. */
  async getProfile(profileId: string) {
    const p = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        photoUrl: true,
        ordersCount: true,
        rider: {
          select: { bikeReg: true, kycStatus: true, ratingAvg: true, ratingCount: true, tripsCount: true, isOnline: true },
        },
      },
    });
    if (!p) throw new NotFoundException("Profile not found");
    return {
      profileId: p.id,
      role: p.role,
      firstName: p.firstName,
      lastName: p.lastName,
      phone: p.phone,
      email: p.email,
      photoUrl: p.photoUrl,
      ordersCount: p.ordersCount,
      rider: p.rider
        ? {
            bikeReg: p.rider.bikeReg,
            kycStatus: p.rider.kycStatus,
            ratingAvg: p.rider.ratingAvg,
            ratingCount: p.rider.ratingCount,
            tripsCount: p.rider.tripsCount,
            isOnline: p.rider.isOnline,
          }
        : null,
    };
  }

  async requestOtp(phone: string, ip: string): Promise<{ sent: true; channel: string; devCode?: string }> {
    await this.enforceRate(`rl:phone:${phone}`, RL.phone);
    await this.enforceRate(`rl:ip:${ip}`, RL.ip);
    await this.enforceRate("rl:global", RL.global);

    const code = this.tokens.randomOtp();
    await this.store.put(phone, this.tokens.hash(code), this.env.OTP_TTL_SECONDS);
    await this.sender.send(phone, code);

    // Return the code in the response ONLY when it can't be a takeover vector:
    //  - dev/test: any phone on the console channel (local signup convenience), OR
    //  - prod QA: the console channel AND an allowlisted OTP_TEST_PHONES number, so a real
    //    device can test signup with no WhatsApp BSP; arbitrary phones are never exposed.
    const consoleChannel = this.env.OTP_CHANNEL === "console";
    const exposeCode =
      consoleChannel && (this.env.NODE_ENV !== "production" || this.isTestPhone(phone));
    const devCode = exposeCode ? code : undefined;
    // Never leak whether the phone exists — always "sent".
    return { sent: true, channel: this.sender.channel(), ...(devCode ? { devCode } : {}) };
  }

  /**
   * QA allowlist (OTP_TEST_PHONES, comma-separated) — gates returning the OTP code in prod.
   * Compares with cosmetic formatting (spaces/dashes/parens) stripped on BOTH sides, so a tester
   * whose device sends "+263 77 000 0011" still matches "+263770000011" in the list. This is a
   * comparison-only normalization — it never widens the match to a different number, and does not
   * touch the auth identity key (the raw phone). (Full E.164 normalization of the identity key is
   * a separate, broader change — deferred.)
   */
  private isTestPhone(phone: string): boolean {
    const norm = (p: string): string => p.replace(/[\s()-]/g, "");
    const allow = (this.env.OTP_TEST_PHONES ?? "")
      .split(",")
      .map(norm)
      .filter(Boolean);
    return allow.includes(norm(phone));
  }

  async verifyOtp(phone: string, code: string, userAgent?: string): Promise<SessionTokens & {
    profileId: string;
    role: string;
    needsProfile: boolean;
  }> {
    const done = this.metrics.startTimer();
    // Record duration + the mapped result on EVERY exit path, then re-throw so callers see the error.
    const record = (result: OtpVerifyResult): void => this.metrics.recordOtpVerify(done(), result);
    try {
      const rec = await this.store.get(phone);
      if (!rec) {
        record("expired");
        throw new UnauthorizedException("Code expired or never requested");
      }
      if (rec.attempts >= MAX_OTP_ATTEMPTS) {
        await this.store.del(phone);
        record("locked");
        throw new UnauthorizedException("Too many attempts — request a new code");
      }

      const attempts = await this.store.incrAttempts(phone);
      if (!this.tokens.safeEqualHex(this.tokens.hash(code), rec.hash)) {
        if (attempts >= MAX_OTP_ATTEMPTS) await this.store.del(phone);
        record("invalid");
        throw new UnauthorizedException("Invalid code");
      }
      await this.store.del(phone);

      const profile = await this.prisma.profile.upsert({
        where: { phone },
        update: { phoneVerifiedAt: new Date() },
        create: { phone, firstName: "", lastName: "", role: "customer", phoneVerifiedAt: new Date() },
        select: { id: true, role: true, firstName: true },
      });

      const session = await this.issueSession(profile.id, profile.role, userAgent);
      record("ok");
      return { ...session, profileId: profile.id, role: profile.role, needsProfile: profile.firstName === "" };
    } catch (err) {
      // An UnauthorizedException already recorded its specific result above; anything else is an
      // unexpected failure (DB/session mint) → label "error". Re-throw regardless.
      if (!(err instanceof UnauthorizedException)) record("error");
      throw err;
    }
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<SessionTokens> {
    const dot = refreshToken.indexOf(".");
    const sessionId = dot > 0 ? refreshToken.slice(0, dot) : "";
    const secret = dot > 0 ? refreshToken.slice(dot + 1) : "";
    if (!sessionId || !secret) throw new UnauthorizedException("Malformed refresh token");

    const s = await this.prisma.session
      .findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          profileId: true,
          refreshTokenHash: true,
          revokedAt: true,
          expiresAt: true,
          profile: { select: { role: true } },
        },
      })
      .catch(() => null);

    const valid =
      s &&
      !s.revokedAt &&
      s.expiresAt > new Date() &&
      this.tokens.safeEqualHex(this.tokens.hash(secret), s.refreshTokenHash);
    if (!s || !valid) throw new UnauthorizedException("Invalid or expired refresh token");

    // Rotate: revoke the old session, mint a new one.
    await this.prisma.session.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
    return this.issueSession(s.profileId, s.profile.role, userAgent);
  }

  async logout(sessionId: string): Promise<{ revoked: boolean }> {
    const res = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: res.count > 0 };
  }

  private async issueSession(profileId: string, role: string, userAgent?: string): Promise<SessionTokens> {
    const accessToken = this.tokens.signAccess(profileId, role);
    const secret = this.tokens.randomToken();
    const session = await this.prisma.session.create({
      data: {
        profileId,
        refreshTokenHash: this.tokens.hash(secret),
        userAgent: userAgent ?? null,
        expiresAt: new Date(Date.now() + this.env.REFRESH_TTL_SECONDS * 1000),
      },
      select: { id: true },
    });
    return {
      accessToken,
      refreshToken: `${session.id}.${secret}`,
      expiresIn: this.env.ACCESS_TTL_SECONDS,
    };
  }

  private async enforceRate(key: string, limit: { max: number; windowSec: number }): Promise<void> {
    const count = await this.store.hit(key, limit.windowSec);
    if (count > limit.max) {
      throw new HttpException("Too many requests — try again later", HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
