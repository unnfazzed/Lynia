import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { isCommissionActive, resolveCommissionRatePct, SERVICE_CORRIDOR, haversineKm } from "@lynia/shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { KYC_VENDOR, type KycVendor } from "../kyc/kyc-vendor";
import { auditData } from "../admin/admin.shared";
import { baseBroadcastRadiusM } from "../common/broadcast-policy";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { TrackingService } from "../tracking/tracking.service";
import { canGoOnline, onlineRefusalReason, type OnlineRefusal, REFUSAL_MESSAGE } from "./online-gate";

// Re-export the online-gate helpers so existing importers (matching/offers/tests) keep their
// `from "./rider.service"` path. The definitions live in ./online-gate — importing them from here
// would re-form the rider↔tracking cycle those services' imports are designed to avoid.
export { canGoOnline, onlineRefusalReason, type OnlineRefusal };

type Kyc = "pending" | "verified" | "failed" | "expired";

@Injectable()
export class RiderService {
  private readonly logger = new Logger(RiderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(KYC_VENDOR) private readonly vendor: KycVendor,
    private readonly pii: PiiCryptoService,
    private readonly tracking: TrackingService,
    // Standing-demotion funnel (Class-B): the board-kick half of evictRiderFromSupply is socket-layer, so
    // it lives on the gateway, not TrackingService. TrackingModule exports the gateway and doesn't depend
    // on RidersModule, so this stays acyclic (same wiring admin-riders.service uses).
    private readonly gateway: TrackingGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * How many OTHER accounts (INCLUDING erased tombstones — DS15-02b keeps their hash) carry this
   * national ID. This is the A-04 REVIEWER signal: it feeds `duplicateIdFlag`, which survives for
   * legacy pre-policy rows and for erased-tombstone matches (a returning user re-registering), and
   * still holds a vendor auto-verify for human review (DOC-16-05). The hard BLOCK lives in
   * {@link RiderService.liveDuplicateIdAccountCount} — live collisions are refused outright since the
   * 2026-07-26 one-ID-one-account rule. Returns 0 for a missing ID (nothing to collide on).
   */
  private async duplicateIdAccountCount(profileId: string, idNumberHash: string | null | undefined): Promise<number> {
    if (!idNumberHash) return 0;
    // Match on the HMAC hash, never the raw (now-encrypted) id_number (LR8).
    return this.prisma.profile.count({ where: { idNumberHash, id: { not: profileId } } });
  }

  /**
   * How many OTHER **live** accounts carry this national ID — the gate for the one-ID-one-account
   * rule (user decision 2026-07-26, supersedes flag-only A-04 for live accounts): an ID may sit on at
   * most one live profile, so the ID-writing paths and `becomeRider` refuse a collision here with a
   * 409 `id_in_use`. Erased tombstones (phone `erased:<id>`) are EXCLUDED: a restricted account can't
   * self-erase (DS15-02 standing gate), so a tombstone match is a legitimate returning user who must
   * not be locked out of their own identity — they're still flagged for the KYC reviewer via
   * {@link RiderService.duplicateIdAccountCount}. Takes the client so ID-writing callers count inside
   * their transaction, under the same-ID advisory lock that serializes concurrent claimers.
   */
  private async liveDuplicateIdAccountCount(db: Prisma.TransactionClient, profileId: string, idNumberHash: string): Promise<number> {
    return db.profile.count({
      where: { idNumberHash, id: { not: profileId }, NOT: { phone: { startsWith: "erased:" } } },
    });
  }

  /** Low-friction signup completion: name + national ID (CONCEPT §5d). */
  async completeProfile(
    profileId: string,
    data: { firstName: string; lastName: string; idNumber: string },
  ): Promise<{ ok: true }> {
    // Store the national ID encrypted at rest + its dedup hash (LR8); never the raw number.
    const idNumberHash = this.pii.hashId(data.idNumber);

    // DS-11 hardening (mirrors auth.service.updateProfile / PATCH /auth/me): a KYC-VERIFIED rider must
    // not silently swap the national ID that was verified — it undermines KYC and is the ban-evasion
    // laundering path (become clean → later switch to the real, colliding ID through whichever endpoint
    // lacks the check). This sibling route previously had NO equivalent guard, so it was an integrity
    // bypass of the freeze. Block a genuine CHANGE (new hash ≠ stored hash) once verified; a real
    // correction goes through support/admin. Same condition + exception as the auth route so both
    // ID-writing endpoints enforce the freeze identically.
    const existing = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { idNumberHash: true, rider: { select: { kycStatus: true } } },
    });
    if (existing?.rider?.kycStatus === "verified" && existing.idNumberHash && existing.idNumberHash !== idNumberHash) {
      throw new ForbiddenException("Your ID is locked after verification — contact support to change it.");
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // One-ID-one-account (2026-07-26): when this write CLAIMS an ID the profile doesn't already hold
        // (stored hash ≠ incoming — a resend of the caller's own ID makes no new claim and must stay
        // idempotent, incl. for legacy pre-policy duplicates), refuse if another LIVE account carries it.
        // The advisory xact lock serializes concurrent claimers of the SAME hash across both ID-writing
        // routes (here + auth.updateProfile), closing the count-then-write race — two parallel signups
        // typing one ID can't both pass the count. Erased tombstones don't block (returning user; see
        // liveDuplicateIdAccountCount) but still set the reviewer flag below.
        if (existing?.idNumberHash !== idNumberHash) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idNumberHash}))`;
          if ((await this.liveDuplicateIdAccountCount(tx, profileId, idNumberHash)) > 0) {
            this.logger.warn(`Profile ${profileId} refused a national ID already on another live account (one-ID-one-account)`);
            throw new ConflictException({
              reason: "id_in_use",
              message: "This national ID is already linked to another account. Contact support if it's yours.",
            });
          }
        }

        // The pre-check above is check-then-write: the KYC webhook (applyKycResult) can commit `verified`
        // between that read and this write, so an iteration that observed a non-verified status can still
        // land a new ID after the freeze took effect. Make the ID-writing update a CAS that re-asserts the
        // freeze atomically — it matches only when the rider is NOT (verified AND actually changing the ID),
        // i.e. the exact condition the pre-check gates on, evaluated at write time. A re-send of the SAME id
        // (idNumberHash unchanged) or a not-yet-verified rider still writes; a genuine change against a
        // now-verified rider matches 0 rows → the same "ID frozen" error.
        const written = await tx.profile.updateMany({
          where: {
            id: profileId,
            NOT: { AND: [{ rider: { kycStatus: "verified" } }, { idNumberHash: { not: idNumberHash } }] },
          },
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            idNumber: this.pii.encryptId(data.idNumber),
            idNumberHash,
          },
        });
        if (written.count === 0) {
          throw new ForbiddenException("Your ID is locked after verification — contact support to change it.");
        }
        // A-04 reviewer signal (DS-11 parity — auth.updateProfile already recomputes; this sibling route
        // previously only logged). After the live-block above, a surviving collision is an erased tombstone
        // (returning user) or a legacy pre-policy duplicate. Persist it on the rider row in the same tx —
        // a no-op for a not-yet-rider caller (becomeRider snapshots the flag at onboarding instead). We
        // don't tell the applicant: surfacing the FLAG would only coach a ban-evader to change the ID.
        const dupCount = await tx.profile.count({ where: { idNumberHash, id: { not: profileId } } });
        await tx.rider.updateMany({ where: { profileId }, data: { duplicateIdFlag: dupCount > 0 } });
        if (dupCount > 0) {
          this.logger.warn(`Profile ${profileId} completed signup with a national ID already on another (erased/legacy) account (A-04)`);
        }
        });
    } catch (err) {
      // IR26-05: the partial unique index on live id_number_hash (migration 0039) is the DB-level
      // backstop behind the advisory-locked count above — if a bypassing write path ever races this
      // one, the index P2002s; surface it as the same 409 the in-app check raises, not a raw 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({
          reason: "id_in_use",
          message: "This national ID is already linked to another account. Contact support if it's yours.",
        });
      }
      throw err;
    }
    return { ok: true };
  }

  /** Upgrade a customer to a rider; submit to KYC (auto) or leave pending for review (manual). */
  async becomeRider(
    profileId: string,
    data: { bikeReg: string; photoUrl: string },
  ): Promise<{ kycStatus: Kyc; mode: Env["KYC_MODE"]; verificationUrl?: string; sessionToken?: string }> {
    const existing = await this.prisma.rider.findUnique({
      where: { profileId },
      select: { profileId: true },
    });
    // BH-04: structured `reason` (not just a plain message) so the client can special-case this
    // exact conflict — it's the expected shape of a lost-response retry (the FIRST submit landed
    // server-side, the rider only saw the dropped/timed-out response) rather than a generic error.
    if (existing) throw new ConflictException({ reason: "already_rider", message: "Already registered as a rider" });

    // The photo key must live under this caller's own KYC namespace — POST /uploads/kyc-photo mints
    // keys as `kyc/<callerId>/<uuid>` — so a rider can't persist a key that points at another user's
    // KYC object (harmless until the reviewer console mints a signed read URL from the stored key).
    if (!data.photoUrl.startsWith(`kyc/${profileId}/`)) {
      throw new BadRequestException("Invalid photo key");
    }

    // One-ID-one-account guard (2026-07-26, supersedes the flag-only A-04 for LIVE accounts): rider
    // onboarding requires a national ID on the profile, and refuses one that's already on another live
    // account. Without the ID requirement the dedup has nothing to key on — an ID-less signup could
    // reach vendor KYC entirely undeduped (the stock client always writes it via completeProfile first,
    // so only a raw API caller ever hits the 400). Erased tombstones don't block (a restricted account
    // can't self-erase — DS15-02 — so a tombstone match is a legitimate returning user); they still set
    // the reviewer flag below, which admin.getKycReview recomputes live and applyKycResult holds
    // auto-verifies on (DOC-16-05). Both checks run BEFORE vendor.submit so a refused signup never
    // bills a paid Didit session.
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { idNumberHash: true },
    });
    if (!profile?.idNumberHash) {
      throw new BadRequestException("Add your national ID to your profile before registering as a rider.");
    }
    if ((await this.liveDuplicateIdAccountCount(this.prisma, profileId, profile.idNumberHash)) > 0) {
      this.logger.warn(`Rider ${profileId} blocked from onboarding: national ID already on another live account (one-ID-one-account)`);
      throw new ConflictException({
        reason: "id_in_use",
        message: "This national ID is already linked to another account. Contact support if it's yours.",
      });
    }
    const duplicateIdFlag = (await this.duplicateIdAccountCount(profileId, profile.idNumberHash)) > 0;
    if (duplicateIdFlag) {
      this.logger.warn(`Rider ${profileId} onboarding with a national ID on another erased/legacy account — flagged for KYC review (A-04)`);
    }

    let kycRef: string | null = null;
    let verificationUrl: string | undefined;
    // SECRET, captured here or never — Didit hands `session_token` back only from session-create, so
    // a token dropped on this path means every later resume mints a fresh paid session (P0-2 / D7).
    let sessionToken: string | undefined;
    if (this.env.KYC_MODE === "auto") {
      // A vendor outage must surface as a retryable 503, not an unhandled 500 — and we throw before
      // creating the rider row, so a failed submit leaves no half-onboarded rider behind.
      try {
        const submission = await this.vendor.submit(profileId);
        kycRef = submission.ref;
        verificationUrl = submission.url;
        sessionToken = submission.token;
      } catch (err) {
        this.logger.error(`KYC submit failed for ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
        throw new ServiceUnavailableException("Couldn't start ID verification. Please try again.");
      }
    }

    // QA/test: the stub provider has no real vendor and never calls back, so in auto mode it
    // acts as an instant pass — the rider is created already verified and can go online, making
    // the full rider flow (online → bid → deliver → OTP) testable with no Didit account. A real
    // provider (didit) still starts pending and is resolved by the vendor callback or the admin
    // backstop. Flip KYC_PROVIDER=didit before launch (see docs/PILOT-READINESS.md).
    const stubAutoPass = this.env.KYC_PROVIDER === "stub" && this.env.KYC_MODE === "auto";
    const initialKyc: Kyc = stubAutoPass ? "verified" : "pending";

    // DS13-06: the findUnique pre-check above races a concurrent duplicate become — the (profileId)
    // primary key on the rider row is the real guard. Map its P2002 to the same 409 the pre-check raises
    // (mirrors orders.service/rateSender) instead of leaking a raw 500 to the losers of a parallel burst.
    try {
      await this.prisma.$transaction([
        this.prisma.profile.update({ where: { id: profileId }, data: { role: "rider" } }),
        this.prisma.rider.create({
          data: {
            profileId,
            bikeReg: data.bikeReg,
            photoUrl: data.photoUrl,
            kycStatus: initialKyc,
            idVerified: stubAutoPass,
            kycRef,
            // Only ever attached to a still-pending session. The stub auto-pass path lands `verified`
            // immediately, and a verified rider must carry no live credential.
            kycSessionToken: stubAutoPass ? null : (sessionToken ?? null),
            kycSessionUrl: stubAutoPass ? null : (verificationUrl ?? null),
            duplicateIdFlag,
          },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("You're already a rider");
      }
      throw err;
    }
    return { kycStatus: initialKyc, mode: this.env.KYC_MODE, verificationUrl, sessionToken: stubAutoPass ? undefined : sessionToken };
  }

  /**
   * Re-run KYC for an existing rider whose check is pending or failed. RESUMES the live session when
   * there is one (free), and only mints a fresh — paid — session when there isn't. Verified riders are
   * left untouched.
   *
   * WHY RESUME EXISTS (P0-2 / gap G5). This used to call `vendor.submit()` unconditionally, so every
   * "Finish verifying" tap burned a Didit session. That is the whole cost of the rider-facing resume
   * button: a rider who backs out of the SDK at step one and taps again should re-enter the SAME check,
   * not buy a new one. The 5/hour throttle on the route capped the bleed; it never stopped it.
   *
   * NOTHING HERE TOUCHES `kycAttempts` (owner decision D4). The A-02 counter is incremented in exactly
   * one place — `applyKycResult` on a vendor `failed` decision — because it counts DECLINES, evidence
   * about the rider's identity. A retry is not a decline: an SDK that never opened (camera blocked, no
   * network) tells us nothing about their ID, and counting it would let a broken phone burn both
   * attempts and land the rider in the support queue having never been assessed. The regression test
   * pins this; see rider.service.spec.ts.
   */
  async retryKyc(profileId: string): Promise<{ kycStatus: Kyc; mode: Env["KYC_MODE"]; verificationUrl?: string; sessionToken?: string }> {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: { kycStatus: true, kycAttempts: true, kycRef: true, kycSessionToken: true, kycSessionUrl: true },
    });
    if (!rider) throw new NotFoundException("Not a rider");
    if (rider.kycStatus === "verified") throw new ConflictException("Already verified");
    // A-02 lock: one resubmit is allowed. After a second admin decline (kycAttempts >= 2) the
    // application is locked — no third attempt is minted; the rider must contact support. Enforced here
    // for every mode so a manual-mode rider can't loop past the limit either.
    if (rider.kycAttempts >= 2) {
      throw new ForbiddenException("ID verification is locked after two attempts. Please contact support.");
    }
    // Manual mode has no vendor to resubmit to — the admin backstop resolves it; leave the rider pending.
    // BH-03: include `mode` even on this early return so the client can tell "no verificationUrl
    // because manual review is expected" apart from "no verificationUrl because something went wrong".
    if (this.env.KYC_MODE !== "auto") return { kycStatus: "pending", mode: this.env.KYC_MODE };

    // RESUME PATH — free. A `pending` rider still holding session credentials has an unfinished check,
    // not a dead one: hand them back and let the client re-open the SAME session. Costs zero credits
    // and keeps kycRef stable, so the webhook that eventually lands still resolves this rider.
    //
    // BOTH credentials go back, and that is not belt-and-braces — it is what keeps the SHIPPED app
    // working. Today's build opens `verificationUrl` in a browser tab (resolveKycRetryFeedback reads
    // ONLY that field); the native-SDK client that consumes `sessionToken` is still ahead of us. A
    // resume that returned the token alone would hand the live app a response it cannot use, and its
    // auto-mode fallback renders "Couldn't start verification — try again in a moment." — a false
    // error on a request that actually succeeded, which is precisely the BH-03 bug this codebase
    // already fixed once. Caught in review of this change; the test below pins it.
    //
    // Requiring the URL in the guard (not just the token) keeps that guarantee honest: a row that
    // somehow holds a token but no URL falls through and mints, which costs a credit but always
    // returns something every client can act on.
    //
    // Deliberately scoped to `pending`. A `failed` or `expired` rider needs a genuinely NEW check —
    // their session already reached a terminal decision and Didit will not reopen it — so those fall
    // through to the mint below. The device is the other half of this contract: when the SDK or the
    // browser rejects the credentials as expired, the client calls back here and, once a terminal
    // webhook has cleared the row, it mints (D7).
    if (rider.kycStatus === "pending" && rider.kycRef && rider.kycSessionToken && rider.kycSessionUrl) {
      return {
        kycStatus: "pending",
        mode: this.env.KYC_MODE,
        verificationUrl: rider.kycSessionUrl,
        sessionToken: rider.kycSessionToken,
      };
    }

    let submission: Awaited<ReturnType<KycVendor["submit"]>>;
    try {
      submission = await this.vendor.submit(profileId);
    } catch (err) {
      this.logger.error(`KYC retry failed for ${profileId}: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException("Couldn't restart ID verification. Please try again.");
    }
    // The stub provider has no real callback, so it stands in as an instant pass (QA), mirroring become.
    const stubAutoPass = this.env.KYC_PROVIDER === "stub";
    const next: Kyc = stubAutoPass ? "verified" : "pending";
    // CAS on the observed KYC state instead of a blind update-by-id (mirrors the admin CAS fixes in
    // admin-riders.service). The findUnique above takes no row lock, so between the read and this write
    // the vendor webhook (applyKycResult) or an admin decision (adminSetKyc) may have flipped kycStatus
    // and/or bumped kycAttempts — a blind update would clobber that newer state (re-open a locked
    // application, or reset a just-verified/declined rider back to pending on a stale ref). Guarding on
    // the exact (kycStatus, kycAttempts) we just read makes the two serialize: 0 rows ⇒ the row moved
    // under us ⇒ 409, and the rider re-reads rather than resubmitting onto a stale decision.
    const rotated = await this.prisma.rider.updateMany({
      where: { profileId, kycStatus: rider.kycStatus, kycAttempts: rider.kycAttempts },
      // The new session's token replaces the old one wholesale. `?? null` rather than an optional
      // spread on purpose: a vendor response that carries no token must CLEAR the stale one, not leave
      // the previous session's credential attached to a kycRef it no longer belongs to.
      data: {
        kycStatus: next,
        idVerified: stubAutoPass,
        kycRef: submission.ref,
        kycResolvedAt: null,
        // `?? null` rather than an optional spread, for both: a vendor response missing a credential
        // must CLEAR the stale one, never leave the previous session's secret bound to a kycRef it no
        // longer belongs to. They are always written and cleared together.
        kycSessionToken: submission.token ?? null,
        kycSessionUrl: submission.url ?? null,
      },
    });
    if (rotated.count === 0) {
      throw new ConflictException("Your ID verification just changed — refresh and try again.");
    }
    return { kycStatus: next, mode: this.env.KYC_MODE, verificationUrl: submission.url, sessionToken: submission.token };
  }

  /** The rider's prepaid commission balance for the online-gate, or undefined when commission is off
   *  (rate 0) so the gate skips the commission branch entirely. A never-touched account reads as $0. */
  private async loadCommissionBalance(profileId: string, commissionActive: boolean): Promise<number | undefined> {
    if (!commissionActive) return undefined;
    const account = await this.prisma.commissionAccount.findUnique({
      where: { riderId: profileId },
      select: { balance: true },
    });
    return account ? Number(account.balance) : 0;
  }

  async setOnline(
    profileId: string,
    online: boolean,
    location?: { lat: number; lng: number },
  ): Promise<{ online: boolean }> {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: { kycStatus: true, accountStatus: true, onHold: true, cooldownUntil: true },
    });
    if (!rider) throw new ForbiddenException("Not a rider");
    // Prepaid commission floor (design Flow 2): only load the balance — and only gate on it — once
    // commission is switched on. At the launch rate (0%) `commissionActive` is false, so this is a
    // no-op read-skip and the $0 pilot balance never blocks going online.
    const commissionActive = isCommissionActive(resolveCommissionRatePct(this.env.COMMISSION_RATE_PCT));
    const commissionBalance = await this.loadCommissionBalance(profileId, commissionActive);
    const commissionGate = { commissionActive, commissionBalance };
    // Full online-gate (Q2): kyc + account standing + reliability on_hold + cooldown + commission floor.
    // Only enforced when going ONLINE — a rider can always go offline. The refusal carries a structured
    // `reason` so the app renders the correct blocked state instead of a generic 403.
    if (online) {
      const reason = onlineRefusalReason({ ...rider, ...commissionGate });
      if (reason) throw new ForbiddenException({ reason, message: REFUSAL_MESSAGE[reason] });
      // Q1 service corridor: when the client sends its position, refuse going online outside the launch
      // area so a rider can't take jobs we can't route. Location-optional (skipped if not sent) since an
      // older client may not carry it; the same SERVICE_CORRIDOR the customer order-create gate uses.
      if (location) {
        const center = { lat: SERVICE_CORRIDOR.centerLat, lng: SERVICE_CORRIDOR.centerLng };
        if (haversineKm(center, location) > SERVICE_CORRIDOR.radiusKm) {
          throw new ForbiddenException({ reason: "out_of_area", message: REFUSAL_MESSAGE.out_of_area });
        }
      }
    }
    if (online) {
      // CAS the go-online write on the standing we just gated on (mirrors the admin CAS fixes). The
      // findUnique above takes no row lock, so an admin suspend/ban or an auto reliability hold can
      // commit between the gate read and this write — a blind `update` would flip the rider back to
      // isOnline:true over that fresh decision, re-adding a suspended/held rider to the live-supply
      // plane. Guarding on accountStatus:active + onHold:false makes the two serialize: 0 rows ⇒ the
      // standing changed under us ⇒ refuse, re-deriving the precise reason so the app shows the right
      // blocked state instead of silently going online.
      // KB-HEARTBEAT-MARGIN: stamp the go-online heartbeat with DB now() (not JS new Date()) so every
      // heartbeat writer shares ONE clock domain — recordFix / touchRiderHeartbeat already write now(),
      // and the offer-selection liveness gate (matching.service) judges freshness against these stamps.
      // Mixing app-server Date.now() here with DB now() elsewhere ate into that gate's margin under
      // clock skew. Raw CAS keeps the standing guard (active + not on_hold) exactly as the prior
      // updateMany: $executeRaw returns the affected-row count, so 0 ⇒ an admin suspend/ban or an auto
      // reliability hold committed between the gate read and this write ⇒ refuse and re-derive the reason.
      const claimed = await this.prisma.$executeRaw`
        UPDATE riders
        SET is_online = true,
            last_heartbeat_at = now(),
            updated_at = now()
        WHERE profile_id = ${profileId}::uuid
          AND account_status = 'active'
          AND on_hold = false`;
      if (claimed === 0) {
        const now = await this.prisma.rider.findUnique({
          where: { profileId },
          select: { kycStatus: true, accountStatus: true, onHold: true, cooldownUntil: true },
        });
        const reason = now ? onlineRefusalReason({ ...now, ...commissionGate }) : null;
        if (reason) throw new ForbiddenException({ reason, message: REFUSAL_MESSAGE[reason] });
        throw new ConflictException("Your account status just changed — refresh and try again.");
      }
    } else {
      await this.prisma.rider.update({
        where: { profileId },
        data: { isOnline: false },
      });
    }
    // Going offline explicitly: drop the rider from the geo index right away (the socket may stay
    // connected, so we can't rely on the disconnect flush). Best-effort — PG's is_online is the
    // authority for nearbyRiders; this just stops a now-offline rider lingering in GEOSEARCH results.
    if (!online) await this.tracking.evictFromGeo(profileId);
    // Persist the go-online position so an IDLE online rider (not currently delivering) is actually in
    // the nearby-rider index. The tracking gateway's fix path only writes geo/geog for the ASSIGNED rider
    // on an active order, so without this an online-but-not-delivering rider has no recorded position and
    // nearbyRiders/countNearbyForPickup return false-empty — silently suppressing the customer broadcast.
    // Best-effort: recordFix already swallows Redis errors internally, but guard the PG write too so a DB
    // hiccup can never fail the online-toggle itself.
    if (online && location) {
      try {
        await this.tracking.recordFix(profileId, location.lat, location.lng);
      } catch (err) {
        this.logger.warn(`recordFix on go-online failed for ${profileId}: ${(err as Error).message}`);
      }
    }
    // 2·b1: a rider just came online with a position — ping any customers who were waiting for supply
    // near here ("notify me" on the no-riders state) and clear them from the list. Fire-and-forget and
    // fully best-effort (no Redis → empty drain), so it can never affect the go-online response.
    if (online && location) void this.drainNotifyWaiters(location.lat, location.lng);
    return { online };
  }

  /**
   * Lightweight presence beat (wave-2 W3). The mobile app beats every 20s while online, and that beat
   * used to replay the FULL setOnline mutation — standing-gate read + commission read + CAS write +
   * waitlist GEOSEARCH per rider per beat — the dominant per-rider server cost at scale. This path
   * refreshes only what a beat MEANS (liveness + position), with the sensitive invariants kept
   * deliberately conservative:
   *
   *  - ONE guarded UPDATE refreshes `last_heartbeat_at` only while the rider is STILL online AND in
   *    good standing (`active` + not on-hold) — the same predicate setOnline's go-online CAS enforces.
   *    Every mid-shift demotion path (admin suspend/ban, reliability hold, KYC lapse, cancel-limit
   *    cooldown) already forces `is_online = false` + supply eviction at write time, so a demoted
   *    rider matches 0 rows on the next beat and gets the SAME precise 403 refusal the old
   *    setOnline-beat produced — re-derived below exactly like setOnline's CAS-miss path.
   *  - `drainNotifyWaiters` still runs unconditionally on every real go-ONLINE transition (setOnline).
   *    On beats it runs only when the O(1) `hasNotifyWaiters` probe says the list is non-empty, so the
   *    common empty-waitlist case stops paying a GEOSEARCH every 20s while a queued customer is still
   *    pinged within one beat (≤20s) by an already-online rider nearby — the same outcome as before.
   *  - No commission re-read: the prepaid floor gates the go-ONLINE transition, and at CAS-miss time
   *    the refusal re-derivation below still loads it (exact parity with setOnline's miss path).
   */
  async heartbeat(profileId: string, location?: { lat: number; lng: number }): Promise<{ online: boolean }> {
    const claimed = await this.prisma.$executeRaw`
      UPDATE riders
      SET last_heartbeat_at = now(),
          updated_at = now()
      WHERE profile_id = ${profileId}::uuid
        AND is_online = true
        AND account_status = 'active'
        AND on_hold = false`;
    if (claimed === 0) {
      // Not beating: offline (toggled off elsewhere / forced by a demotion) or standing changed.
      // Re-derive the precise refusal exactly like setOnline's CAS-miss path so the app renders the
      // right blocked state; with clean standing but is_online=false, fall through to the generic 403
      // the client maps to "You were taken offline. Tap Go online to retry."
      const now = await this.prisma.rider.findUnique({
        where: { profileId },
        select: { kycStatus: true, accountStatus: true, onHold: true, cooldownUntil: true },
      });
      if (!now) throw new ForbiddenException("Not a rider");
      const commissionActive = isCommissionActive(resolveCommissionRatePct(this.env.COMMISSION_RATE_PCT));
      const commissionBalance = await this.loadCommissionBalance(profileId, commissionActive);
      const reason = onlineRefusalReason({ ...now, commissionActive, commissionBalance });
      if (reason) throw new ForbiddenException({ reason, message: REFUSAL_MESSAGE[reason] });
      throw new ForbiddenException("You're offline — go online to keep receiving jobs.");
    }
    // Same position persistence as setOnline's go-online write: keeps an IDLE online rider present in
    // the nearby-rider index (recordFix throttles its own PG writes; Redis errors are swallowed inside).
    if (location) {
      try {
        await this.tracking.recordFix(profileId, location.lat, location.lng);
      } catch (err) {
        this.logger.warn(`recordFix on heartbeat failed for ${profileId}: ${(err as Error).message}`);
      }
      // Beat-drain behind the O(1) probe (see doc above). Fire-and-forget and fully best-effort, like
      // setOnline's own drain — a probe/drain failure can never fail the beat.
      void this.tracking
        .hasNotifyWaiters()
        .then((any) => (any ? this.drainNotifyWaiters(location.lat, location.lng) : undefined))
        .catch(() => {});
    }
    return { online: true };
  }

  /**
   * 2·b1: drain the "notify me" waiting list near a newly-online rider and push those customers. Fully
   * best-effort — swallows everything (no Redis, a geo miss, a push outage) so it can never disturb the
   * setOnline that spawned it. Separated out (not inlined) so the fire-and-forget has its own try/catch.
   */
  private async drainNotifyWaiters(lat: number, lng: number): Promise<void> {
    try {
      // F-18 (at-least-once): CLAIM nearby waiters under a short per-waiter lock (dedups concurrent
      // instances AND a burst of riders coming online together → one ping, not N), push, then CLEAR only
      // the ones actually delivered. A waiter is never removed until a push lands, so a no-token /
      // transient-FCM failure — or a crash mid-push — leaves them queued for the next nearby rider
      // instead of being silently dropped. Undelivered claims self-release when the lock TTL lapses; the
      // notify-list TTL bounds the total wait. All best-effort — never affects the rider going online.
      // Drain radius = the BASE broadcast radius (not the widened one): "a rider's online near you"
      // means this rider would have received the customer's initial broadcast (policy BROADCAST).
      const claimed = await this.tracking.claimNotifyWaitersNear(lat, lng, baseBroadcastRadiusM());
      if (claimed.length === 0) return;
      // KB-NOTIFY-ORDERID: claimed carries each waiter's still-open order (if any); notifyRidersAvailable
      // uses it to pick honest live-request copy + route the tap there, and returns the delivered profile
      // ids so only those are cleared from the list (undelivered stay queued — F-18 at-least-once).
      const delivered = await this.notifications.notifyRidersAvailable(claimed);
      const toClear = claimed.filter((w) => delivered.has(w.profileId)).map((w) => w.profileId);
      if (toClear.length > 0) await this.tracking.clearNotifyWaiters(toClear);
    } catch {
      /* best-effort: a notify-drain failure never affects the rider going online */
    }
  }

  /**
   * Vendor callback result → flip the rider's KYC status. Monotonic by `eventAt`: the update only
   * applies when this webhook is newer than the last applied one (kycResolvedAt null or older), so a
   * replayed or out-of-order delivery can't overwrite a newer decision (an exact replay has the same
   * timestamp → not newer → ignored). kycRef is unique, so this matches at most one rider.
   * `updated: 0` means no rider has this ref, or the event was stale/duplicate.
   */
  async applyKycResult(
    kycRef: string,
    status: "verified" | "failed" | "expired",
    eventAt: Date,
    reason?: string | null,
    // IR26-04: the document number the vendor actually verified (extractDiditDocumentNumber), when the
    // decision payload exposes one. Only consulted on a `verified` outcome; null degrades to the
    // pre-IR26-04 behavior so a payload-shape mismatch can never wedge real verifications.
    verifiedDocNumber?: string | null,
  ): Promise<{ updated: number }> {
    // DS15-06: the CAS status mutation AND its AuditLog row commit in ONE transaction — matching the
    // manual adminSetKyc path and admin-riders.service's suspend/lift/ban CAS+audit pairs. Previously the
    // audit row was a separate post-commit `create` in its own warn-only try/catch: if that insert failed
    // (rare, but real — e.g. a connection blip right after the first commit), an automated KYC
    // approve/decline committed with ZERO audit trail, and via KB-FEED-SYNTH the rider silently lost their
    // account-status feed row too (feedForUser derives it from this AuditLog table). Making the pair atomic
    // means an audit-write failure rolls the status write back, so the webhook simply retries — never a
    // committed-without-audit decision. The monotonic/replay-safe guards (F-13 counter, the kycRef +
    // kycResolvedAt CAS `where`) are unchanged: still a guarded `updateMany`, not a blind `update`.
    const { updated, notifyProfileId, demotedProfileId } = await this.prisma.$transaction(async (tx) => {
      // DOC-16-05: a `verified` outcome for a rider already flagged `duplicateIdFlag` (A-04 — their
      // national ID collides with another account, e.g. a banned/suspended one under a new SIM) must NOT
      // auto-verify — that's exactly the auto-mode gap that let a ban-evader re-registering with the same
      // real ID/face sail straight past the reviewer who'd otherwise catch it on `admin.getKycReview`.
      // Read the flag first (kycRef is unique, so at most one row) so the updateMany below can route a
      // flagged match to manual review instead of applying the vendor's `verified`. `failed`/`expired`
      // outcomes are unaffected — the flag only matters for the auto-APPROVE path.
      // DS18-04: row-lock the rider BEFORE the `current` read (mirrors adminSetKyc's `SELECT … FOR UPDATE`
      // below, and order-lifecycle.service's lockRiderRow). The `current` read is a plain unlocked select
      // whose kycAttempts value decides — in this transaction's `data` payload, before the updateMany runs —
      // whether an `expired` reset writes `kycAttempts:0`. The updateMany's WHERE only re-checks
      // kycRef + kycResolvedAt monotonicity at write time, never kycAttempts, so without this lock a
      // concurrent adminSetKyc second-decline (which takes the SAME `FOR UPDATE` lock) committing
      // kycAttempts=2 in the gap between this read and this write would reopen the exact DS17-03 lock-bypass
      // race: a later-timestamped `expired` webhook reads the pre-lock kycAttempts (< 2), decides to reset,
      // and silently wipes the admin's two-decline lock. Taking the lock here serializes this transaction
      // against that adminSetKyc transaction instead of racing it — the CAS updateMany WHERE below still
      // closes the independent replay/reorder race. kyc_ref is unique, so this locks at most one row.
      await tx.$executeRaw`SELECT 1 FROM riders WHERE kyc_ref = ${kycRef} FOR UPDATE`;
      // DS17-03: this read runs UNCONDITIONALLY now (previously only for `verified`) and also pulls
      // kycAttempts, because the `expired` branch below must know the rider's current lock state before it
      // resets the counter — an automated expiry webhook must not silently wipe the A-02 two-decline lock an
      // admin already applied. kycRef is unique, so at most one row. For verified/failed the extra
      // kycAttempts field is simply read and unused (a harmless no-op beyond the existing flag read).
      const current = await tx.rider.findFirst({
        where: { kycRef },
        select: { profileId: true, duplicateIdFlag: true, kycAttempts: true, profile: { select: { idNumberHash: true } } },
      });
      // IR26-04 vendor-document dedupe. The typed-ID gate (IR26-01) blocks reusing a number someone
      // TYPED — a ban-evader's remaining move is typing a DIFFERENT number while showing the same real
      // document to the vendor. When the decision payload exposes the verified document number, hash it
      // (pii.hashId normalizes punctuation/case, so it's directly comparable to Profile.idNumberHash)
      // and refuse to auto-verify when:
      //  - docMismatch: it doesn't match what this applicant typed (or they have no typed ID — a
      //    legacy pre-IR26-02 rider we can't corroborate), OR
      //  - docCollision: it matches ANOTHER account's typed hash or vendor-verified hash (erased
      //    tombstones included — same reviewer-decides semantics as duplicateIdFlag).
      // Absent doc number (null) → both false → exactly the pre-IR26-04 behavior. The raw number is
      // never persisted or logged — only the HMAC hash (LR8).
      const docHash = status === "verified" && verifiedDocNumber && current ? this.pii.hashId(verifiedDocNumber) : null;
      let docMismatch = false;
      let docCollision = false;
      if (docHash && current) {
        docMismatch = current.profile.idNumberHash !== docHash;
        const [profileHits, riderHits] = await Promise.all([
          tx.profile.count({ where: { idNumberHash: docHash, id: { not: current.profileId } } }),
          tx.rider.count({ where: { verifiedIdHash: docHash, profileId: { not: current.profileId } } }),
        ]);
        docCollision = profileHits > 0 || riderHits > 0;
        if (docMismatch || docCollision) {
          this.logger.warn(
            `KYC ${kycRef}: vendor-verified document ${docMismatch ? "does not match the typed national ID" : ""}${docMismatch && docCollision ? " and " : ""}${docCollision ? "collides with another account" : ""} — held for review (IR26-04)`,
          );
        }
      } else if (status === "verified" && !verifiedDocNumber) {
        // Coverage signal, not an error: tells ops whether the Didit workflow/payload actually carries
        // document data (the extraction is fail-open by design — see extractDiditDocumentNumber).
        this.logger.log(`KYC ${kycRef}: verified webhook carried no document number — vendor-doc dedupe skipped`);
      }
      const holdForReview = status === "verified" && (current?.duplicateIdFlag === true || docMismatch || docCollision);
      const res = await tx.rider.updateMany({
        where: { kycRef, OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }] },
        data: {
          // A flagged "verified" outcome does NOT flip kycStatus/idVerified — it stays `pending` so the
          // rider remains in the manual-review queue (admin.getKycReview) instead of going online on an
          // identity that already collides with another account. kycResolvedAt still advances (below) so
          // the same webhook delivery can't be reprocessed.
          ...(holdForReview ? {} : { kycStatus: status, idVerified: status === "verified" }),
          kycResolvedAt: eventAt,
          // The session token dies with the decision it belonged to. Every outcome that reaches here is
          // terminal for THAT session — Didit will not reopen an Approved/Declined/Expired one — so
          // keeping the credential would leave a verified rider carrying a live secret for no reason,
          // and would let retryKyc hand back a token the SDK can only reject.
          //
          // Cleared on the hold-for-review path too, and deliberately: the vendor HAS decided (that is
          // why we are in this branch), the session is spent, and only our own review is outstanding.
          // A rider held for review who taps retry should mint a fresh session, not resume a decided one.
          kycSessionToken: null,
          kycSessionUrl: null,
          // IR26-04: persist the vendor-verified document hash EVEN when holding for review — a later
          // applicant presenting the same physical document must collide with this row too, and the
          // admin review screen surfaces the mismatch/collision from it.
          ...(docHash ? { verifiedIdHash: docHash } : {}),
          // Record the auto-decline reason (Didit score below the threshold) so the rider app can show
          // why, and clear any stale reason on a verify/expiry (unchanged for `expired`; a flagged
          // `verified` held for review isn't a resolved decision yet, so its stale decline reason, if
          // any, is deliberately left in place rather than cleared).
          ...(status === "failed" ? { kycDeclineReason: reason ?? null } : holdForReview ? {} : { kycDeclineReason: null }),
          // F-13: a vendor DECLINE bumps the A-02 attempt counter too, so the auto path throttles retries
          // exactly like the manual admin decline does — without this, auto-mode retries were uncapped,
          // each minting a fresh paid vendor session. The increment rides the SAME monotonic guard as the
          // rest of this updateMany (kycRef + kycResolvedAt null/older than eventAt): a webhook REPLAY or
          // out-of-order delivery matches 0 rows (an exact replay has the same eventAt → not `lt` → no
          // match), so it can't double-count. Only a genuinely new decline on a fresh ref (retryKyc mints
          // a new kycRef and clears kycResolvedAt) increments again → the second decline locks at >= 2.
          ...(status === "failed" ? { kycAttempts: { increment: 1 } } : {}),
          // An expiry (1·b2) is not a decline: reset the A-02 attempt counter so re-verification isn't
          // trapped by an ancient decline the rider already recovered from before they were verified.
          // DS17-03: but ONLY when the rider isn't already locked (kycAttempts < 2). A stale vendor session
          // timing out and firing `expired` AFTER an admin's second decline must not silently wipe the
          // permanent two-decline lock (retryKyc's A-02 gate) — that would hand a locked applicant a third
          // attempt. An admin choosing to reset the lock goes through adminSetKyc's manual expire path,
          // which is a deliberate human decision and keeps its own unconditional reset.
          ...(status === "expired" && (current?.kycAttempts ?? 0) < 2 ? { kycAttempts: 0 } : {}),
          // Standing-demotion (Class-B sibling of BR-01/DS15-05): a rider verified+online at the moment
          // their KYC lapses to failed/expired can no longer bid (onlineRefusalReason gates on
          // kyc=verified), so leaving them isOnline:true keeps them counted in the customer-facing
          // ridersNearby supply and still receiving broadcasts/board pushes. Force offline in the same
          // write; the post-commit evictRiderFromSupply below clears the Redis geo index + board rooms.
          // (verified/holdForReview never demote — they don't set this.)
          ...(status === "failed" || status === "expired" ? { isOnline: false } : {}),
        },
      });
      // Only when the update actually applied (res.count > 0 — not a stale/replayed webhook). `expired`
      // is handled by its own re-verify prompt; a `holdForReview` verify isn't a decision the rider app
      // should be told about yet (it's still pending), so it gets its own audit action + no push, while a
      // genuine verified/failed outcome keeps the existing feed-sync + notify behavior. kycRef is unique
      // → at most one rider.
      let resolvedProfileId: string | null = null;
      if (res.count > 0 && holdForReview) {
        const rider = await tx.rider.findFirst({ where: { kycRef }, select: { profileId: true } });
        if (rider) {
          // The audit reason names every condition that held the verify (IR26-04 widened this beyond
          // the original duplicate_id_flag), so the review trail says WHY without exposing any hash.
          const holdReason = [
            current?.duplicateIdFlag ? "duplicate_id_flag" : null,
            docMismatch ? "verified_id_mismatch" : null,
            docCollision ? "verified_id_collision" : null,
          ]
            .filter(Boolean)
            .join("+");
          await tx.auditLog.create({
            data: auditData("system:kyc-webhook", "rider.kyc_review_required", rider.profileId, holdReason, null),
          });
        }
        // No notifyProfileId: the rider isn't told anything changed — they're still `pending`, same as
        // before this webhook arrived, until a human resolves the flag via adminSetKyc.
      } else if (res.count > 0 && (status === "verified" || status === "failed")) {
        const rider = await tx.rider.findFirst({ where: { kycRef }, select: { profileId: true } });
        if (rider) {
          // KB-FEED-SYNTH: the AUTOMATED vendor path must ALSO write an AuditLog row (only the manual
          // adminSetKyc path did), so feedForUser can synthesize an account-status feed row uniformly.
          // Reuse the SAME action strings as adminSetKyc (rider.kyc_approve / rider.kyc_decline), but
          // mark the actor as automated ("system:kyc-webhook") so admin audit views can still tell manual
          // from automated decisions. Same transaction as the status write — never one without the other.
          const action = status === "verified" ? "rider.kyc_approve" : "rider.kyc_decline";
          await tx.auditLog.create({
            data: auditData("system:kyc-webhook", action, rider.profileId, reason ?? null, null),
          });
          resolvedProfileId = rider.profileId;
        }
      }
      // Class-B eviction: a lapse (failed/expired) that actually applied needs the profileId post-commit
      // so we can pull the (now non-verified) rider out of the live-supply planes. `failed` already has it
      // (resolvedProfileId); `expired` never fetched it (it takes no verified/failed branch), so fetch here.
      let demotedId: string | null = status === "failed" ? resolvedProfileId : null;
      if (res.count > 0 && status === "expired") {
        const rider = await tx.rider.findFirst({ where: { kycRef }, select: { profileId: true } });
        demotedId = rider?.profileId ?? null;
      }
      return { updated: res.count, notifyProfileId: resolvedProfileId, demotedProfileId: demotedId };
    });
    // Class-B sibling of BR-01/DS15-05: a KYC lapse pulled the rider offline in PG above; now evict them
    // from the board rooms + `rider:geo` Redis index through the standing-demotion funnel, exactly as
    // suspend/ban/auto-hold do. Best-effort, post-commit; never throws, never affects the committed write.
    if (demotedProfileId) void this.gateway.evictRiderFromSupply(demotedProfileId);
    // Best-effort, post-commit: tell the rider their ID check resolved (nothing surfaced this before). A
    // notify miss can NEVER affect the committed KYC write above (notifyKycDecision is fire-and-forget).
    // notifyProfileId is set only for a committed verified/failed decision, so this reaches only those two.
    if (notifyProfileId && (status === "verified" || status === "failed")) {
      this.notifyKycDecision(notifyProfileId, status);
    }
    return { updated };
  }

  /** Best-effort push telling a rider their KYC decision landed → route to their rider home (`/rider`).
   *  Fire-and-forget (notifyProfiles never throws); a notification miss can't affect the KYC write. */
  private notifyKycDecision(profileId: string, status: "verified" | "failed"): void {
    const msg =
      status === "verified"
        ? { title: "You're verified", body: "You're verified — go online to start taking deliveries." }
        : { title: "ID check needs another look", body: "We couldn't verify your ID — open the app to see why and try again." };
    void this.notifications.notifyProfiles([profileId], { ...msg, data: { kind: "account" } });
  }

  /**
   * Admin KYC decision write-back (A-02 state machine) + manual-review backstop (T7).
   *
   * - **approve** (`verified`) → rider can go online; clear any prior decline reason.
   * - **decline** (`failed`) → record the `reasonCode` (surfaced to the rider app + the audit log) and
   *   increment `kycAttempts`. The second decline pushes the counter to >= 2, which locks resubmission
   *   in `retryKyc` (one resubmit allowed → then support).
   * - `pending` is the plain backstop reset (no counter change).
   *
   * `locked` is returned so the console can reflect the terminal state immediately without re-reading.
   *
   * A-01: the decision and its audit row commit in ONE transaction (the KYC path was previously the sole
   * console action whose audit row was a separate, non-atomic POST — a failed decision could leave an
   * audit row for a decision that never took effect). `actor` is the forwarded operator; `note` is the
   * optional ConfirmModal free-text.
   */
  async adminSetKyc(
    profileId: string,
    status: Kyc,
    reasonCode?: string | null,
    actor?: string,
    note?: string | null,
  ): Promise<{ profileId: string; kycStatus: Kyc; kycAttempts: number; locked: boolean }> {
    // verified → approve, failed → decline, expired → expire (1·b2 ops backstop), pending → reset
    // (matches the ConfirmModal action names).
    const action =
      status === "verified"
        ? "rider.kyc_approve"
        : status === "failed"
          ? "rider.kyc_decline"
          : status === "expired"
            ? "rider.kyc_expire"
            : "rider.kyc_reset";

    const decision = await this.prisma.$transaction(async (tx) => {
      // Row-lock the rider before the read (mirrors order-lifecycle.service's lockRiderRow). The
      // findUnique below takes no lock on its own, so a concurrent vendor-webhook decline
      // (applyKycResult, which bumps kycAttempts) landing between this read and the update would let one
      // logical decline be double-counted — over-locking an honest rider. Taking `FOR UPDATE` here makes
      // the webhook's own write serialize against this transaction instead of interleaving with it.
      await tx.$executeRaw`SELECT 1 FROM riders WHERE profile_id = ${profileId}::uuid FOR UPDATE`;
      const rider = await tx.rider.findUnique({
        where: { profileId },
        select: { profileId: true, kycAttempts: true, kycStatus: true, kycResolvedAt: true },
      });
      if (!rider) throw new NotFoundException("Rider not found");

      let result: { profileId: string; kycStatus: Kyc; kycAttempts: number; locked: boolean };
      if (status === "failed") {
        // Decline: record the reason and bump the attempt counter. The increment is the lock's source of
        // truth — a second decline lands at >= 2 and retryKyc refuses to mint a third session.
        //
        // F-14: the counter must not double-count the SAME logical decline. A decline whose HTTP response
        // was lost and retried (the console re-submitting the identical action) finds the rider already
        // sitting in a resolved `failed` state — that's a repeat, not a new attempt, so it must not
        // re-increment (it would over-lock an honest rider). A genuine SECOND decline only happens after
        // the rider RESUBMITTED, which retryKyc signals by leaving `failed` and clearing kycResolvedAt —
        // so guard the increment on "not already a resolved failure". The reason/audit is still re-recorded
        // on every call; only the counter is guarded.
        const isRepeatOfSameDecline = rider.kycStatus === "failed" && rider.kycResolvedAt != null;
        const updated = await tx.rider.update({
          where: { profileId },
          data: {
            kycStatus: "failed",
            idVerified: false,
            kycDeclineReason: reasonCode ?? null,
            // Terminal human decision — the session it belonged to is spent. Same reasoning as the
            // webhook path: a declined rider must not carry a live credential, and retryKyc must mint
            // rather than hand back a token that can only be rejected.
            kycSessionToken: null,
            kycSessionUrl: null,
            ...(isRepeatOfSameDecline ? {} : { kycAttempts: { increment: 1 } }),
            // Stamp the resolution time so applyKycResult's monotonic guard treats this human decision
            // as the latest word: a later (or replayed) vendor webhook with an older eventAt can no
            // longer flip a manually-declined rider back to verified. retryKyc clears it on a genuine
            // resubmit, so a fresh vendor result still resolves.
            kycResolvedAt: new Date(),
            // Class-B demotion: a decline pulls the rider out of good standing, so force offline in the
            // same write (mirrors the webhook path); post-commit evictRiderFromSupply clears geo/board.
            isOnline: false,
          },
          select: { kycAttempts: true },
        });
        result = { profileId, kycStatus: "failed", kycAttempts: updated.kycAttempts, locked: updated.kycAttempts >= 2 };
      } else {
        // Approve / pending reset: no counter change. Clearing the decline reason on approve keeps the
        // rider app from showing a stale "you were declined for …" once they're verified.
        await tx.rider.update({
          where: { profileId },
          data: {
            kycStatus: status,
            idVerified: status === "verified",
            // Cleared on every branch here, including a `pending` RESET. A reset is an invitation for a
            // FRESH vendor result, so leaving the old session's token attached would let retryKyc resume
            // the very check the admin just set aside.
            kycSessionToken: null,
            kycSessionUrl: null,
            // A manual APPROVE is a terminal human decision: stamp kycResolvedAt so a later/replayed
            // vendor webhook can't override it (mirrors the decline path). A `pending` RESET is
            // deliberately inviting a fresh vendor result, so it leaves kycResolvedAt untouched.
            ...(status === "verified" ? { kycDeclineReason: null, kycResolvedAt: new Date() } : {}),
            // A manual EXPIRE (1·b2 ops backstop) is also terminal: stamp the time, clear any stale
            // decline reason, and reset the A-02 counter so re-verification isn't blocked by an old lock.
            ...(status === "expired" ? { kycDeclineReason: null, kycResolvedAt: new Date(), kycAttempts: 0 } : {}),
            // Class-B demotion: any transition OUT of verified (expired, or a `pending` reset) means the
            // rider can no longer bid (onlineRefusalReason gates on verified), so pull them offline in the
            // same write. A verified APPROVE is the one status that keeps them online-eligible.
            ...(status === "verified" ? {} : { isOnline: false }),
          },
        });
        const nextAttempts = status === "expired" ? 0 : rider.kycAttempts;
        result = { profileId, kycStatus: status, kycAttempts: nextAttempts, locked: nextAttempts >= 2 };
      }

      // Same transaction as the decision — never one without the other. `actor` is absent only in older
      // callers/tests; skip the row then rather than attribute the action to no one.
      if (actor) {
        await tx.auditLog.create({ data: auditData(actor, action, profileId, reasonCode ?? null, note ?? null) });
      }
      return result;
    });
    // Class-B eviction: any non-verified decision pulled the rider offline above (isOnline:false); evict
    // them from the board rooms + geo index through the standing-demotion funnel too. Best-effort,
    // post-commit; a verified approve is the one outcome that keeps them online-eligible, so no eviction.
    if (decision.kycStatus !== "verified") void this.gateway.evictRiderFromSupply(profileId);
    // Best-effort, post-commit: mirror the vendor-webhook path — tell the rider a manual approve/decline
    // changed their standing. Only the two outcomes that flip what they can do; a `pending` reset /
    // `expired` is deliberately silent (it invites a fresh check rather than announcing a verdict).
    if (decision.kycStatus === "verified" || decision.kycStatus === "failed") {
      this.notifyKycDecision(profileId, decision.kycStatus);
    }
    return decision;
  }
}
