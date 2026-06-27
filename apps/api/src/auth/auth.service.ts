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

    // Local/dev convenience: on the console channel outside production, return the code so
    // signup is testable with no messaging provider. Never leaks in production.
    const devCode =
      this.env.OTP_CHANNEL === "console" && this.env.NODE_ENV !== "production" ? code : undefined;
    // Never leak whether the phone exists — always "sent".
    return { sent: true, channel: this.sender.channel(), ...(devCode ? { devCode } : {}) };
  }

  async verifyOtp(phone: string, code: string, userAgent?: string): Promise<SessionTokens & {
    profileId: string;
    role: string;
    needsProfile: boolean;
  }> {
    const rec = await this.store.get(phone);
    if (!rec) throw new UnauthorizedException("Code expired or never requested");
    if (rec.attempts >= MAX_OTP_ATTEMPTS) {
      await this.store.del(phone);
      throw new UnauthorizedException("Too many attempts — request a new code");
    }

    const attempts = await this.store.incrAttempts(phone);
    if (!this.tokens.safeEqualHex(this.tokens.hash(code), rec.hash)) {
      if (attempts >= MAX_OTP_ATTEMPTS) await this.store.del(phone);
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
    return { ...session, profileId: profile.id, role: profile.role, needsProfile: profile.firstName === "" };
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
