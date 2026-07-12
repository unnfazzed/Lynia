import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { normalizePhone, type UpdateProfileRequest } from "@lynia/shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService, type OtpVerifyResult } from "../observability/metrics.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { OTP_SENDER, type OtpSender } from "./otp-sender";
import { OTP_STORE, type OtpStore } from "./otp-store";
import { TokenService } from "./token.service";

const MAX_OTP_ATTEMPTS = 5;
// Post-verify retry grace window (UX review 2026-07-11 §6). A successful verify deletes the OTP
// record BEFORE the response reaches the client, so on the flaky links this app targets a client
// timeout (15s) + retry with the SAME correct code used to hit "expired" — the user was signed in
// server-side but never received tokens. For this window after a successful compare we keep only
// the code's hash so that retry can be recognized and re-issued a fresh session. 60s covers the
// client timeout plus a retry or two while keeping the replay window tight.
const OTP_GRACE_TTL_SECONDS = 60;
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
    private readonly pii: PiiCryptoService,
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
        onHold: true,
        rider: {
          select: {
            bikeReg: true,
            kycStatus: true,
            ratingAvg: true,
            ratingCount: true,
            tripsCount: true,
            isOnline: true,
            // A-02: surface the decline reason + attempt count so the rider app can show what to fix
            // on a resubmit and the attempt-2 lock state (item 4).
            kycDeclineReason: true,
            kycAttempts: true,
            // So the cancel-confirm sheet can warn "this is strike N of LIMIT" before a cancel lands,
            // instead of the rider only learning their count at the moment they get locked out.
            cancelStrikes: true,
          },
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
      // S·2: customer account standing — true blocks new broadcasts (the app shows the on-hold screen).
      onHold: p.onHold,
      rider: p.rider
        ? {
            bikeReg: p.rider.bikeReg,
            kycStatus: p.rider.kycStatus,
            ratingAvg: p.rider.ratingAvg,
            ratingCount: p.rider.ratingCount,
            tripsCount: p.rider.tripsCount,
            isOnline: p.rider.isOnline,
            kycDeclineReason: p.rider.kycDeclineReason,
            kycAttempts: p.rider.kycAttempts,
            cancelStrikes: p.rider.cancelStrikes,
          }
        : null,
    };
  }

  /** Set the caller's name on the post-OTP profile-setup step (PATCH /auth/me). Scoped to their own
   *  profileId; only firstName/lastName are touched. Names are already trimmed + length-capped by the
   *  UpdateProfileRequest contract. Returns the same shape as getProfile so the client can refresh. */
  async updateProfile(profileId: string, body: UpdateProfileRequest) {
    await this.prisma.profile.update({
      where: { id: profileId },
      // idNumber is stored on the account record (0·6), not verified. Only write it when provided so
      // a name-only edit (or the returning-user path) never clears an existing value.
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        // Store the national ID encrypted at rest + its dedup hash (LR8); never the raw number.
        ...(body.idNumber ? { idNumber: this.pii.encryptId(body.idNumber), idNumberHash: this.pii.hashId(body.idNumber) } : {}),
      },
      select: { id: true },
    });
    return this.getProfile(profileId);
  }

  async requestOtp(rawPhone: string, ip: string): Promise<{ sent: true; channel: string; devCode?: string }> {
    // Canonicalize to E.164 at the boundary so every downstream key (OTP store, rate limit, and the
    // profile identity in verifyOtp) is the same string regardless of how the number was typed.
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new BadRequestException("Enter a valid phone number");
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
   * QA allowlist (OTP_TEST_PHONES, comma-separated) — gates returning the OTP code in prod. `phone` is
   * already E.164-normalized by requestOtp, so we canonicalize each list entry the same way: an entry
   * written as "+263 77 000 0011", "0770000011", or "263770000011" all match the same tester.
   */
  private isTestPhone(phone: string): boolean {
    const allow = (this.env.OTP_TEST_PHONES ?? "")
      .split(",")
      .map((e) => normalizePhone(e))
      .filter((e): e is string => e !== null);
    return allow.includes(phone);
  }

  async verifyOtp(rawPhone: string, code: string, userAgent?: string): Promise<SessionTokens & {
    profileId: string;
    role: string;
    needsProfile: boolean;
  }> {
    // Same canonicalization as requestOtp — the OTP was stored (and the profile is keyed) under E.164.
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new BadRequestException("Enter a valid phone number");
    const done = this.metrics.startTimer();
    // Record duration + the mapped result on EVERY exit path, then re-throw so callers see the error.
    const record = (result: OtpVerifyResult): void => this.metrics.recordOtpVerify(done(), result);
    try {
      const rec = await this.store.get(phone);
      if (!rec) {
        // No live OTP — this may be a timed-out client retrying a code the server already
        // accepted (§6). A grace hit mints a fresh session; a miss falls through to the exact
        // same error as having no grace record at all, so a probe can't distinguish "recently
        // verified, wrong guess" from "nothing here" (no oracle).
        const graced = await this.verifyViaGrace(phone, code, userAgent);
        if (graced) {
          record("grace_ok");
          return graced;
        }
        record("expired");
        throw new UnauthorizedException("Code expired or never requested");
      }

      // Atomically consume one attempt BEFORE evaluating the guess. incrAttempts is a single
      // Redis HINCRBY (one round-trip) or a single synchronous mutation in memory, so N concurrent
      // verifies receive N distinct counts and only the first MAX_OTP_ATTEMPTS can ever reach the
      // compare below. This closes the check-then-increment TOCTOU where concurrent guesses all
      // passed a stale attempts==0 gate, defeating the 5-attempt cap.
      const attempts = await this.store.incrAttempts(phone);
      if (attempts > MAX_OTP_ATTEMPTS) {
        await this.store.del(phone);
        record("locked");
        throw new UnauthorizedException("Too many attempts — request a new code");
      }

      if (!this.tokens.safeEqualHex(this.tokens.hash(code), rec.hash)) {
        record("invalid");
        throw new UnauthorizedException("Invalid code");
      }
      // Write the grace record (code hash only — never the raw code, never tokens) BEFORE deleting
      // the live OTP: a crash between the two just leaves the live record to be re-verified
      // normally, whereas the reverse order would reopen the exact "committed but client never got
      // tokens" gap the grace record exists to heal.
      await this.store.graceSet(phone, rec.hash, OTP_GRACE_TTL_SECONDS);
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

    // Rotate atomically: revoke the old session ONLY if it's still un-revoked, so two concurrent
    // refreshes bearing the same token can't both win and mint two live sessions from one token. The
    // guarded updateMany is the real gate (the read above is advisory); a zero-count claim means the
    // token was already rotated — treat it as reuse and reject rather than issuing a second session.
    const revoked = await this.prisma.session.updateMany({
      where: { id: s.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) throw new UnauthorizedException("Invalid or expired refresh token");
    return this.issueSession(s.profileId, s.profile.role, userAgent);
  }

  async logout(sessionId: string, profileId: string): Promise<{ revoked: boolean }> {
    // Scope by the caller's profileId so a user can only revoke their OWN session — otherwise a
    // leaked session UUID is a targeted forced-logout of any account.
    const res = await this.prisma.session.updateMany({
      where: { id: sessionId, profileId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: res.count > 0 };
  }

  /**
   * Timeout-retry grace (§6): returns a fresh session when a short-TTL grace record proves this
   * exact code was already verified successfully, or null (→ caller emits the normal "expired"
   * error) on any miss.
   *
   * Security reasoning:
   *  - A grace hit requires the exact correct code (constant-time hash compare), so it grants
   *    nothing a still-live OTP record wouldn't have granted. The 5-attempt counter protected the
   *    code while it was live; here the 60s TTL bounds exposure instead — deliberately no attempt
   *    counter on this path (an attacker gets nothing from hammering it that they couldn't get
   *    from the "expired" error, and the TTL is the rate limit).
   *  - The record is deliberately NOT consumed on a hit: two client retries racing each other is
   *    exactly the failure mode being healed, and each hit mints an independent session (sessions
   *    are already multi-device), so a replay within the window adds no privilege.
   *  - Only the code hash is ever at rest — never the raw code, never session tokens.
   */
  private async verifyViaGrace(
    phone: string,
    code: string,
    userAgent?: string,
  ): Promise<(SessionTokens & { profileId: string; role: string; needsProfile: boolean }) | null> {
    const graceHash = await this.store.graceGet(phone);
    if (!graceHash || !this.tokens.safeEqualHex(this.tokens.hash(code), graceHash)) return null;
    // The original verify upserted the profile, so it must exist — plain read, and re-derive
    // needsProfile the same way as the happy path. If it somehow vanished, fall through to the
    // normal "expired" error rather than minting an account from a grace hit.
    const profile = await this.prisma.profile.findUnique({
      where: { phone },
      select: { id: true, role: true, firstName: true },
    });
    if (!profile) return null;
    const session = await this.issueSession(profile.id, profile.role, userAgent);
    return { ...session, profileId: profile.id, role: profile.role, needsProfile: profile.firstName === "" };
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
