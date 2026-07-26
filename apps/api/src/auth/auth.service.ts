import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { normalizePhone, RiderAccountStatus, type UpdateProfileRequest } from "@lynia/shared";
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
// Belt-and-suspenders cap on grace-path guesses per phone within the grace window. The grace record
// itself carries no attempt counter by design (see verifyViaGrace), and the route throttle is keyed
// per IP — this per-phone fixed-window ceiling ensures even a distributed (many-IP) probe can't get
// more than a handful of guesses at the correct code while it lingers. Mirrors MAX_OTP_ATTEMPTS so a
// legit timeout-retry (typically 1–2 re-sends of the same correct code) is never affected.
const MAX_GRACE_ATTEMPTS = 5;
// Refresh-token rotation lost-response grace window (RT-GRACE). Mirrors the OTP-verify grace (§6): a
// rotate whose response is dropped in flight leaves the client holding the just-revoked token, so its
// retry would otherwise get a hard 401 and force a full re-OTP. Within this window of the rotation we
// re-issue on that retry instead. Kept tight (60s) — long enough to cover the client timeout + a retry,
// short enough to bound a replay of a stolen just-revoked token, exactly like the OTP grace TTL.
const REFRESH_GRACE_TTL_MS = 60_000;
// Per-phone / per-IP / global send caps (ET5: each send costs BSP money — enumeration is a budget-DoS).
// The global daily cap is the SPEND ceiling, not just an abuse ceiling: `POST /auth/otp/request` is
// unauthenticated by necessity (it IS the signup entry point), and on the live Bird channel each send
// costs ~EUR 0.195, so the cap multiplied by that price is the most a day can cost. Every window is
// env-overridable so it can be tightened DURING an incident, or widened for a launch push, without
// shipping code — see config/env.ts.
const rlFrom = (env: Env) => ({
  phone: { max: env.OTP_RL_PHONE_MAX, windowSec: 3600 },
  ip: { max: env.OTP_RL_IP_MAX, windowSec: 3600 },
  global: { max: env.OTP_RL_GLOBAL_MAX, windowSec: 86400 },
  // KB-IDENTITY-BINDING L1: cap NEW-account creation per device per day. Phone-only identity makes a fresh
  // SIM = a fresh account for free; binding signups to a (soft) device id raises that cost and blunts
  // casual multi-accounting. Generous enough for a genuinely shared family device; tight enough that one
  // handset can't mint a sock-puppet army. Reinstall resets the id (a determined attacker's out) — the
  // hardware-backed answer is L3 attestation. Enforced on every signup: the device id is REQUIRED to
  // create an account (see verifyOtp), so this can no longer be skipped by omitting the header.
  deviceSignup: { max: env.OTP_RL_DEVICE_SIGNUP_MAX, windowSec: 86400 },
});
// L0 recycle-detection: a re-verify of an EXISTING account from a device never seen for it, after this
// long without a fresh session, is flagged as a possible SIM recycle (non-destructive signal only).
const RECYCLE_DORMANCY_MS = 90 * 24 * 60 * 60 * 1000;

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
            // BH-03: KYC_MODE is a global deploy config, not a per-rider column — surfaced here so
            // the app can tell "pending, waiting on a browser vendor flow" (auto) apart from "pending,
            // waiting on manual ops review, no browser step exists" (manual) instead of always assuming auto.
            kycMode: this.env.KYC_MODE,
          }
        : null,
    };
  }

  /** Set the caller's name on the post-OTP profile-setup step (PATCH /auth/me). Scoped to their own
   *  profileId; only firstName/lastName are touched. Names are already trimmed + length-capped by the
   *  UpdateProfileRequest contract. Returns the same shape as getProfile so the client can refresh. */
  async updateProfile(profileId: string, body: UpdateProfileRequest) {
    const idNumberHash = body.idNumber ? this.pii.hashId(body.idNumber) : undefined;

    // DS-11 hardening: a KYC-VERIFIED rider must not silently swap the national ID that was verified —
    // it undermines KYC and is the ban-evasion laundering path (become clean → later switch to the real,
    // colliding ID). Block a genuine CHANGE (new hash ≠ stored hash) once verified; a real correction
    // goes through support/admin. Pre-verification edits and first-time customer entry are unaffected
    // (recompute of the A-04 flag below still keeps the reviewer signal honest in that window).
    if (idNumberHash) {
      const existing = await this.prisma.profile.findUnique({
        where: { id: profileId },
        select: { idNumberHash: true, rider: { select: { kycStatus: true } } },
      });
      if (existing?.rider?.kycStatus === "verified" && existing.idNumberHash && existing.idNumberHash !== idNumberHash) {
        throw new ForbiddenException("Your ID is locked after verification — contact support to change it.");
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // idNumber is stored on the account record (0·6). Only write it when provided so a name-only edit
      // (or the returning-user path) never clears an existing value.
      if (idNumberHash) {
        // The pre-check above is check-then-write: the KYC webhook (applyKycResult) can commit `verified`
        // between that read and this write, so an iteration that observed a non-verified status could
        // still land a new ID after the freeze took effect. Make the ID-writing update a CAS that
        // re-asserts the freeze atomically — it matches only when the rider is NOT (verified AND actually
        // changing the ID), i.e. the exact condition the pre-check gates on, evaluated at write time. A
        // re-send of the SAME id (or a not-yet-verified rider) still writes; a genuine change against a
        // now-verified rider matches 0 rows → the same "ID frozen" error.
        const written = await tx.profile.updateMany({
          where: {
            id: profileId,
            NOT: { AND: [{ rider: { kycStatus: "verified" } }, { idNumberHash: { not: idNumberHash } }] },
          },
          // Store the national ID encrypted at rest + its dedup hash (LR8); never the raw number.
          data: { firstName: body.firstName, lastName: body.lastName, idNumber: this.pii.encryptId(body.idNumber!), idNumberHash },
        });
        if (written.count === 0) {
          throw new ForbiddenException("Your ID is locked after verification — contact support to change it.");
        }
      } else {
        await tx.profile.update({
          where: { id: profileId },
          data: { firstName: body.firstName, lastName: body.lastName },
        });
      }

      // DS-11: the A-04 duplicate-ID / ban-evasion flag is otherwise computed ONLY at completeProfile
      // / becomeRider. Rewriting idNumber here without recomputing it lets a rider onboard under a
      // clean ID (flag clear) and later swap in the real, colliding ID — or launder a flagged ID to a
      // clean one — silently bypassing the reviewer's signal. Recompute against the new hash and
      // persist it on the rider row (updateMany: a no-op for a non-rider caller), in the same tx.
      if (idNumberHash) {
        const dupCount = await tx.profile.count({ where: { idNumberHash, id: { not: profileId } } });
        await tx.rider.updateMany({ where: { profileId }, data: { duplicateIdFlag: dupCount > 0 } });
        if (dupCount > 0) {
          this.logger.warn(
            `Profile ${profileId} changed national ID to one already on another account — A-04 flag set (DS-11)`,
          );
        }
      }
    });
    return this.getProfile(profileId);
  }

  async requestOtp(rawPhone: string, ip: string): Promise<{ sent: true; channel: string; devCode?: string }> {
    // Canonicalize to E.164 at the boundary so every downstream key (OTP store, rate limit, and the
    // profile identity in verifyOtp) is the same string regardless of how the number was typed.
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new BadRequestException("Enter a valid phone number");
    const rl = rlFrom(this.env);
    await this.enforceRate(`rl:phone:${phone}`, rl.phone);
    await this.enforceRate(`rl:ip:${ip}`, rl.ip);
    await this.enforceRate("rl:global", rl.global);

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

  async verifyOtp(rawPhone: string, code: string, userAgent?: string, deviceId?: string): Promise<SessionTokens & {
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

      // KB-IDENTITY-BINDING L1/L0 — device binding. The upsert below stays the atomic writer; this is
      // an advisory read that gates signup throttling + the recycle signal.
      const existing = await this.prisma.profile.findUnique({
        where: { phone },
        select: {
          id: true,
          sessions: { select: { deviceId: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 },
        },
      });

      if (!existing) {
        // L1: the device id is REQUIRED to create an account. It used to be optional, which made the
        // per-device signup cap opt-out: sending a random id got you capped at 3/day, sending none at
        // all skipped the check entirely, so the control rewarded non-compliance (CodeQL
        // js/user-controlled-bypass). Demanding it costs nothing — the app sends it on every request
        // and MIN_SUPPORTED_APP_VERSION retires any client that stops.
        //
        // Scoped to CREATION only, deliberately: an existing account signing in from a client that
        // somehow omits the header still gets in, so this can never lock out someone already
        // registered. It is a 400, not a 429 — the caller sent a malformed request, and conflating it
        // with the rate limit would make a genuine cap-hit indistinguishable from a broken client.
        if (!deviceId) {
          throw new BadRequestException("A device id is required to create an account.");
        }
        // A fresh SIM is free; a fresh device is not. This is now unconditional on the signup path.
        await this.enforceRate(`rl:signup:device:${deviceId}`, rlFrom(this.env).deviceSignup);
      } else if (deviceId && !existing.sessions.some((s) => s.deviceId === deviceId)) {
        // L0: an existing account verifying from a device never seen for it. If it's been dormant this
        // long, flag a possible SIM recycle (P2-8) — a NON-destructive ops signal only. Auto-detaching
        // the account on a device change would lock out a legit user who reinstalled or changed phones;
        // the destructive rebind is deliberately deferred (see docs/plans/2026-identity-and-pod-hardening.md).
        const newest = existing.sessions[0]?.createdAt?.getTime() ?? 0;
        const dormant = Date.now() - newest > RECYCLE_DORMANCY_MS;
        this.logger.warn(
          `identity: account ${existing.id} verified from a NEW device${dormant ? " after >90d dormancy — POSSIBLE SIM RECYCLE (P2-8)" : " (device change)"}`,
        );
        // A log line can't be alerted on. Phone is the account key, so a dormant re-verify from an
        // unseen device is the shape a carrier number-recycle takes — the person passing the OTP may
        // not be the person who owns the account. Counting it makes the rate visible before deciding
        // how hard to gate the rebind.
        this.metrics.incIdentityNewDeviceVerify(dormant);
      }

      const profile = await this.prisma.profile.upsert({
        where: { phone },
        update: { phoneVerifiedAt: new Date() },
        create: { phone, firstName: "", lastName: "", role: "customer", phoneVerifiedAt: new Date() },
        select: { id: true, role: true, firstName: true },
      });

      const session = await this.issueSession(profile.id, profile.role, userAgent, deviceId);
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
          rotatedToId: true,
          expiresAt: true,
          profile: { select: { role: true, rider: { select: { accountStatus: true } } } },
        },
      })
      .catch(() => null);

    // A wrong secret, or an unknown/expired session, is ALWAYS a hard reject — never eligible for grace.
    // (Unlike before, a *revoked* session is no longer rejected up front: a token revoked by rotation
    // may still qualify for the lost-response grace below. Hash + expiry remain hard gates.)
    const secretOk =
      !!s && s.expiresAt > new Date() && this.tokens.safeEqualHex(this.tokens.hash(secret), s.refreshTokenHash);
    if (!s || !secretOk) throw new UnauthorizedException("Invalid or expired refresh token");

    // FRAUD P2-3 backstop: a suspended/banned rider must not be able to renew access tokens. suspend/ban
    // now revoke sessions in-transaction (admin-riders.service), but this re-check fails closed for ANY
    // demotion path that forgets to revoke — the guard itself never re-reads standing, so refresh is the
    // one renewal chokepoint where we can enforce it cheaply. A non-rider (customer) has no rider row, so
    // this is a no-op for them. Hard reject, never graced — a demoted rider can't lost-response-heal either.
    const standing = s.profile.rider?.accountStatus;
    if (standing === RiderAccountStatus.SUSPENDED || standing === RiderAccountStatus.BANNED) {
      throw new UnauthorizedException("Account is not active");
    }

    if (s.revokedAt) {
      // The presented token was already revoked. If it was revoked by ROTATION and its successor is
      // still un-consumed within the grace window, this is the "lost the rotate response, retried the
      // old token" case (RT-GRACE) — re-issue. Any other revoked token (logout, or a successor already
      // consumed downstream = a replay after the chain moved on) is still rejected.
      const graced = await this.refreshViaGrace(s, userAgent);
      if (graced) return graced;
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Rotate atomically: revoke the old session ONLY if it's still un-revoked, so two concurrent
    // refreshes bearing the same token can't both win and mint two live sessions from one token. The
    // guarded updateMany is the real gate (the read above is advisory).
    const revoked = await this.prisma.session.updateMany({
      where: { id: s.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      // We lost the CAS to a concurrent refresh that revoked it first — that racer minted the successor.
      // Fall to the same grace path so the loser of a legitimate concurrent refresh heals to a session
      // instead of a spurious hard 401; still gated on rotatedToId + an un-consumed successor + the short
      // window, so a genuine replay is rejected.
      const graced = await this.refreshViaGrace(s, userAgent);
      if (graced) return graced;
      throw new UnauthorizedException("Invalid or expired refresh token");
    }
    // Mint the successor, then link the rotated session to it so the lost-response grace can find it.
    const successor = await this.issueSession(s.profileId, s.profile.role, userAgent);
    const successorId = successor.refreshToken.slice(0, successor.refreshToken.indexOf("."));
    await this.prisma.session
      .update({ where: { id: s.id }, data: { rotatedToId: successorId } })
      .catch((err) => {
        // Best-effort link: a failure here only means this specific token can't be graced on a lost
        // response (it degrades to today's hard reject), never that the successor is lost. Don't fail
        // the refresh over it.
        this.logger.warn(`refresh: failed to link rotated session ${s.id}: ${(err as Error).message}`);
      });
    return successor;
  }

  /**
   * RT-GRACE: heal the single legitimate "lost the rotate response" retry. Returns a fresh session when
   * the presented (revoked) token was revoked BY ROTATION, within the grace window, AND its successor is
   * still un-consumed; otherwise null (→ the caller emits the normal hard reject). Safety invariants
   * mirror the OTP-verify grace (§6):
   *  - Hash + expiry were already proven by the caller, so this grants nothing a live token wouldn't.
   *  - `rotatedToId` must be set: a logout-revoke (null) is never graced.
   *  - The successor must still be un-revoked and unexpired. Once the client actually consumed the
   *    successor (rotated it → it's now revoked), the chain has moved on, so a later presentation of the
   *    old token is a replay and is rejected — this is what preserves reuse detection.
   *  - The short window (REFRESH_GRACE_TTL_MS from revokedAt) bounds exposure the way the OTP TTL does.
   *  - The successor's secret is never stored (only its hash), so we mint a fresh independent session —
   *    sessions are already multi-device, so this grants no privilege beyond the successor itself.
   * The revoked/rotatedTo/expiry fields are RE-READ here (not trusted from the caller's earlier read) so
   * the CAS-lost concurrent path sees the racer's committed revocation + link.
   */
  private async refreshViaGrace(
    s: { id: string; profileId: string; profile: { role: string } },
    userAgent?: string,
  ): Promise<SessionTokens | null> {
    const fresh = await this.prisma.session
      .findUnique({ where: { id: s.id }, select: { revokedAt: true, rotatedToId: true, expiresAt: true } })
      .catch(() => null);
    if (!fresh || !fresh.revokedAt || !fresh.rotatedToId) return null;
    if (fresh.expiresAt <= new Date()) return null;
    if (Date.now() - fresh.revokedAt.getTime() > REFRESH_GRACE_TTL_MS) return null;
    const successor = await this.prisma.session
      .findUnique({ where: { id: fresh.rotatedToId }, select: { revokedAt: true, expiresAt: true } })
      .catch(() => null);
    // Successor gone, already consumed (revoked = chain advanced → replay), or expired → not the
    // lost-response case; reject rather than mint.
    if (!successor || successor.revokedAt || successor.expiresAt <= new Date()) return null;
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
    // Cap grace-path guesses per phone (reuses the store's generic fixed-window counter with a key
    // prefix distinct from the send-rate limits). Over the ceiling falls through to the same null →
    // "expired" as any miss, so it adds a per-phone attempt bound without opening an oracle.
    const graceAttempts = await this.store.hit(`rl:grace:${phone}`, OTP_GRACE_TTL_SECONDS);
    if (graceAttempts > MAX_GRACE_ATTEMPTS) return null;

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

  private async issueSession(profileId: string, role: string, userAgent?: string, deviceId?: string): Promise<SessionTokens> {
    const accessToken = this.tokens.signAccess(profileId, role);
    const secret = this.tokens.randomToken();
    const session = await this.prisma.session.create({
      data: {
        profileId,
        refreshTokenHash: this.tokens.hash(secret),
        userAgent: userAgent ?? null,
        // KB-IDENTITY-BINDING L1: stamp the device this session was minted from (null for older clients).
        deviceId: deviceId ?? null,
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
