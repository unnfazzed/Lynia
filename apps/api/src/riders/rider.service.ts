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
import { SERVICE_CORRIDOR, haversineKm } from "@lynia/shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { KYC_VENDOR, type KycVendor } from "../kyc/kyc-vendor";
import { auditData } from "../admin/admin.shared";
import { baseBroadcastRadiusM } from "../common/broadcast-policy";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
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
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * How many OTHER accounts already carry this national ID (A-04 duplicate-account / ban-evasion
   * signal). A national ID can repeat across accounts because `phone`, not `id_number`, is the unique
   * account key — so a rider with a second SIM can register again under the same ID. A legitimate
   * re-entry, a typo, and a deliberate second account are indistinguishable here, which is why callers
   * FLAG rather than block. Returns 0 for a missing ID (nothing to collide on).
   */
  private async duplicateIdAccountCount(profileId: string, idNumberHash: string | null | undefined): Promise<number> {
    if (!idNumberHash) return 0;
    // Match on the HMAC hash, never the raw (now-encrypted) id_number (LR8).
    return this.prisma.profile.count({ where: { idNumberHash, id: { not: profileId } } });
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

    await this.prisma.profile.update({
      where: { id: profileId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        idNumber: this.pii.encryptId(data.idNumber),
        idNumberHash,
      },
    });
    // A-04 duplicate-ID signal. The rider row may not exist yet (this often runs before becomeRider),
    // so there's nothing to flag on here — log for the audit trail; becomeRider persists the reviewer
    // flag. We don't tell the applicant: surfacing it would only coach a ban-evader to change the ID.
    if ((await this.duplicateIdAccountCount(profileId, idNumberHash)) > 0) {
      this.logger.warn(`Profile ${profileId} completed signup with a national ID already on another account (A-04)`);
    }
    return { ok: true };
  }

  /** Upgrade a customer to a rider; submit to KYC (auto) or leave pending for review (manual). */
  async becomeRider(
    profileId: string,
    data: { bikeReg: string; photoUrl: string },
  ): Promise<{ kycStatus: Kyc; mode: Env["KYC_MODE"]; verificationUrl?: string }> {
    const existing = await this.prisma.rider.findUnique({
      where: { profileId },
      select: { profileId: true },
    });
    if (existing) throw new ConflictException("Already registered as a rider");

    // The photo key must live under this caller's own KYC namespace — POST /uploads/kyc-photo mints
    // keys as `kyc/<callerId>/<uuid>` — so a rider can't persist a key that points at another user's
    // KYC object (harmless until the reviewer console mints a signed read URL from the stored key).
    if (!data.photoUrl.startsWith(`kyc/${profileId}/`)) {
      throw new BadRequestException("Invalid photo key");
    }

    // A-04 duplicate-account guard: does this rider's national ID already sit on another account? A
    // FLAG for the KYC reviewer, never a block — the ID isn't a unique key (phone is), so we can't
    // tell a ban-evading second SIM from a legit re-entry, and hard-rejecting would lock out honest
    // re-registrations. The reviewer already compares the ID on the doc-review screen, where
    // admin.getKycReview surfaces the colliding accounts. Snapshot here; the review recomputes it live.
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { idNumberHash: true },
    });
    const duplicateIdFlag = (await this.duplicateIdAccountCount(profileId, profile?.idNumberHash)) > 0;
    if (duplicateIdFlag) {
      this.logger.warn(`Rider ${profileId} onboarding with a national ID already on another account — flagged for KYC review (A-04)`);
    }

    let kycRef: string | null = null;
    let verificationUrl: string | undefined;
    if (this.env.KYC_MODE === "auto") {
      // A vendor outage must surface as a retryable 503, not an unhandled 500 — and we throw before
      // creating the rider row, so a failed submit leaves no half-onboarded rider behind.
      try {
        const submission = await this.vendor.submit(profileId);
        kycRef = submission.ref;
        verificationUrl = submission.url;
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
    return { kycStatus: initialKyc, mode: this.env.KYC_MODE, verificationUrl };
  }

  /**
   * Re-run KYC for an existing rider whose check is pending or failed (Didit allows retries within the
   * workflow's retry window). Mints a fresh verification session, points the rider at the new ref, and
   * clears kycResolvedAt so the new webhook resolves it. Verified riders are left untouched.
   */
  async retryKyc(profileId: string): Promise<{ kycStatus: Kyc; verificationUrl?: string }> {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: { kycStatus: true, kycAttempts: true },
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
    if (this.env.KYC_MODE !== "auto") return { kycStatus: "pending" };

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
    await this.prisma.rider.update({
      where: { profileId },
      data: { kycStatus: next, idVerified: stubAutoPass, kycRef: submission.ref, kycResolvedAt: null },
    });
    return { kycStatus: next, verificationUrl: submission.url };
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
    // Full online-gate (Q2): kyc + account standing + reliability on_hold + cooldown. Only enforced
    // when going ONLINE — a rider can always go offline. The refusal carries a structured `reason` so
    // the app renders the correct blocked state instead of a generic 403.
    if (online) {
      const reason = onlineRefusalReason(rider);
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
    await this.prisma.rider.update({
      where: { profileId },
      data: { isOnline: online, lastHeartbeatAt: online ? new Date() : undefined },
    });
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
      const delivered = await this.notifications.notifyRidersAvailable(claimed);
      const toClear = claimed.filter((id) => delivered.has(id));
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
  ): Promise<{ updated: number }> {
    const res = await this.prisma.rider.updateMany({
      where: { kycRef, OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }] },
      data: {
        kycStatus: status,
        idVerified: status === "verified",
        kycResolvedAt: eventAt,
        // Record the auto-decline reason (Didit score below the threshold) so the rider app can show
        // why, and clear any stale reason on a verify.
        ...(status === "failed" ? { kycDeclineReason: reason ?? null } : { kycDeclineReason: null }),
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
        ...(status === "expired" ? { kycAttempts: 0 } : {}),
      },
    });
    // Best-effort: tell the rider their ID check resolved (nothing surfaced this before). Only when the
    // update actually applied (res.count > 0 — not a stale/replayed webhook) and only for the two
    // outcomes that change what the rider can do; an `expired` is handled by its own re-verify prompt.
    if (res.count > 0 && (status === "verified" || status === "failed")) {
      // kycRef is unique → at most one rider. Resolve the profile to notify; a lookup/notify failure is
      // swallowed and can NEVER fail or roll back the webhook write above.
      try {
        const rider = await this.prisma.rider.findFirst({ where: { kycRef }, select: { profileId: true } });
        if (rider) this.notifyKycDecision(rider.profileId, status);
      } catch (err) {
        this.logger.warn(`KYC result notify failed for ref ${kycRef}: ${(err as Error).message}`);
      }
    }
    return { updated: res.count };
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
            ...(isRepeatOfSameDecline ? {} : { kycAttempts: { increment: 1 } }),
            // Stamp the resolution time so applyKycResult's monotonic guard treats this human decision
            // as the latest word: a later (or replayed) vendor webhook with an older eventAt can no
            // longer flip a manually-declined rider back to verified. retryKyc clears it on a genuine
            // resubmit, so a fresh vendor result still resolves.
            kycResolvedAt: new Date(),
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
            // A manual APPROVE is a terminal human decision: stamp kycResolvedAt so a later/replayed
            // vendor webhook can't override it (mirrors the decline path). A `pending` RESET is
            // deliberately inviting a fresh vendor result, so it leaves kycResolvedAt untouched.
            ...(status === "verified" ? { kycDeclineReason: null, kycResolvedAt: new Date() } : {}),
            // A manual EXPIRE (1·b2 ops backstop) is also terminal: stamp the time, clear any stale
            // decline reason, and reset the A-02 counter so re-verification isn't blocked by an old lock.
            ...(status === "expired" ? { kycDeclineReason: null, kycResolvedAt: new Date(), kycAttempts: 0 } : {}),
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
    // Best-effort, post-commit: mirror the vendor-webhook path — tell the rider a manual approve/decline
    // changed their standing. Only the two outcomes that flip what they can do; a `pending` reset /
    // `expired` is deliberately silent (it invites a fresh check rather than announcing a verdict).
    if (decision.kycStatus === "verified" || decision.kycStatus === "failed") {
      this.notifyKycDecision(profileId, decision.kycStatus);
    }
    return decision;
  }
}
