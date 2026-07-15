import { ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { ACTIVE_RIDE_STATUSES, RiderAccountStatus } from "@lynia/shared";
import { Prisma } from "@prisma/client";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";

/** A-02 (KYC two-decline lock): kycAttempts at/above this is the "locked → support" state that
 *  becomeRider/applyKycResult and admin.getKycReview all gate on. Mirrored here so a locked rider
 *  can't self-erase out from under it (DS15-02). */
const KYC_LOCK_ATTEMPTS = 2;

/** Structured 409 body for a standing-blocked erasure (DS15-02) — same { reason, message } shape the
 *  online-gate / customer-hold refusals use, so the app's ApiError.code pipeline can route it. */
const ERASE_BLOCKED_MESSAGE =
  "Your account is under a standing restriction (hold, suspension, ban, cooldown, or ID-review lock) and can't be deleted — contact support.";

/** The standing fields the erasure gate reads off a profile (+ its rider row, when it has one). */
type ErasureStanding = {
  onHold: boolean;
  rider: {
    // `string` (not the shared enum) so a Prisma-typed row assigns without nominal friction; compared
    // against the RiderAccountStatus values below.
    accountStatus: string;
    onHold: boolean;
    cooldownUntil: Date | null;
    kycAttempts: number;
  } | null;
};

/** Select shape shared by the pre-flight read and the in-tx re-read of the standing gate. */
const STANDING_SELECT = {
  onHold: true,
  rider: { select: { accountStatus: true, onHold: true, cooldownUntil: true, kycAttempts: true } },
} as const;

/**
 * An order waypoint (`pickup` / `dropoff`) is a JSON blob `{ point, landmark, contactPhone }`.
 * `contactPhone` is dialable PII the API masks everywhere else — but it lives inside a Json column, so
 * the profile/rider/GPS scrub in eraseAccount never reaches it. Return a copy with the phone nulled (the
 * shape is preserved so order-history renderers keep working), or `undefined` when there is nothing to
 * strip so the caller can skip the write. The pickup/dropoff coordinates are left as retained order-
 * ledger data — once the profile is anonymised the location is no longer tied to an identifiable person.
 */
function stripWaypointPhone(value: Prisma.JsonValue | null): Prisma.InputJsonValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const wp = value as Record<string, unknown>;
  if (wp.contactPhone == null) return undefined;
  return { ...wp, contactPhone: null } as Prisma.InputJsonValue;
}

/**
 * Data-retention + right-to-erasure enforcement (LR8 / CDPA — docs/DATA-RETENTION.md).
 *
 * Erasure ANONYMISES in place rather than hard-deleting: a profile is referenced by orders, ratings,
 * and the audit log (rows kept for the financial/dispute/compliance record), so we scrub the PII and
 * keep the (now anonymous) row + its id so those references stay intact.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    // Both optional so unit tests can construct the service with just Prisma + env. In the app:
    // StorageModule is @Global (always injected) and PrivacyModule imports TrackingModule so the
    // gateway resolves — @Optional() keeps a test harness / trimmed module that omits them from failing.
    @Optional() @Inject(STORAGE) private readonly storage?: StorageAdapter,
    @Optional() private readonly gateway?: TrackingGateway,
  ) {}

  /**
   * DS15-02: gate self-erasure on the caller's current standing. A banned/suspended/held/cooldown/
   * KYC-locked account must NOT be able to anonymise itself and re-register clean (same phone + same ID
   * document), evading every standing control. Throws a structured 409 when any restriction is live;
   * returns cleanly otherwise. Called BOTH pre-flight (fast reject) and again INSIDE the tx (TOCTOU:
   * narrows a concurrent admin ban's race window to the transaction itself, mirroring the active-ride
   * re-check).
   */
  private assertErasableStanding(standing: ErasureStanding, now: Date): void {
    // Customer hold (S·2) — a held customer is blocked from broadcasting; they can't erase past it either.
    if (standing.onHold) {
      throw new ConflictException({ reason: "account_on_hold", message: ERASE_BLOCKED_MESSAGE });
    }
    const rider = standing.rider;
    if (!rider) return;
    if (rider.accountStatus === RiderAccountStatus.BANNED) {
      throw new ConflictException({ reason: "account_banned", message: ERASE_BLOCKED_MESSAGE });
    }
    if (rider.accountStatus === RiderAccountStatus.SUSPENDED) {
      throw new ConflictException({ reason: "account_suspended", message: ERASE_BLOCKED_MESSAGE });
    }
    // RH-01: the sticky VELOCITY/fraud hold (admin-only-clearable by design) is an onHold=true state —
    // it must survive, not be self-cleared via erasure.
    if (rider.onHold) {
      throw new ConflictException({ reason: "account_on_hold", message: ERASE_BLOCKED_MESSAGE });
    }
    if (rider.cooldownUntil && rider.cooldownUntil.getTime() > now.getTime()) {
      throw new ConflictException({ reason: "cooldown_active", message: ERASE_BLOCKED_MESSAGE });
    }
    // A-02: two declines lock KYC to support. Erasing would reset the lock for a clean re-registration.
    if (rider.kycAttempts >= KYC_LOCK_ATTEMPTS) {
      throw new ConflictException({ reason: "kyc_locked", message: ERASE_BLOCKED_MESSAGE });
    }
  }

  /** Right to erasure. Anonymises the caller's profile + scrubs their PII; keeps the order/audit ledger. */
  async eraseAccount(profileId: string): Promise<{ erased: true }> {
    const now = new Date();
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      // photoUrl + rider.{photoUrl,kycRef} are captured so the post-commit GCS purge (DS15-03) has the
      // object keys AFTER the tx nulls the DB pointers; the rest backs the standing gate (DS15-02).
      select: {
        id: true,
        phone: true,
        photoUrl: true,
        onHold: true,
        rider: {
          select: {
            accountStatus: true,
            onHold: true,
            cooldownUntil: true,
            kycAttempts: true,
            photoUrl: true,
            kycRef: true,
          },
        },
      },
    });
    if (!profile) throw new NotFoundException("Profile not found");
    const isRider = profile.rider != null;

    // Never strand a live delivery: a customer with an open/active order or a rider mid-ride must
    // finish or cancel first. (Erasing mid-ride would break the counterparty's in-flight delivery.)
    const activeRide = await this.prisma.order.findFirst({
      where: {
        status: { in: ACTIVE_RIDE_STATUSES },
        OR: [{ customerId: profileId }, { riderId: profileId }],
      },
      select: { id: true },
    });
    if (activeRide) {
      throw new ConflictException("Finish or cancel your active delivery before deleting your account");
    }

    // Idempotent: an already-erased profile carries the tombstone phone — re-running is a no-op. Checked
    // before the standing gate so a re-run of a legitimately-erased account never trips it.
    if (profile.phone.startsWith("erased:")) return { erased: true };

    // DS15-02: refuse self-erasure while the account is under any standing restriction (ban / suspend /
    // hold / cooldown / KYC lock). Pre-flight reject here for a fast, clear error…
    this.assertErasableStanding(profile, now);

    await this.prisma.$transaction(async (tx) => {
      // Re-check the active-ride guard INSIDE the transaction (DS-10). The pre-flight read above is
      // a fast rejection, but between it and this scrub a counterparty could select this rider onto a
      // new order (or the customer could place one), which the outer read wouldn't see — anonymising
      // mid-ride would then break the counterparty's live delivery. Re-reading here narrows that
      // window to the transaction itself.
      const activeMidErase = await tx.order.findFirst({
        where: {
          status: { in: ACTIVE_RIDE_STATUSES },
          OR: [{ customerId: profileId }, { riderId: profileId }],
        },
        select: { id: true },
      });
      if (activeMidErase) {
        throw new ConflictException("Finish or cancel your active delivery before deleting your account");
      }

      // DS15-02 (TOCTOU): re-read + re-assert standing INSIDE the tx. The pre-flight gate above is a fast
      // reject, but between it and this scrub an admin could commit a ban/suspend/hold — anonymising past
      // it would strip the standing controls (and, with idNumberHash preserved below, still be caught on
      // re-registration, but we must not let the erasure itself race past a just-landed restriction).
      const freshStanding = await tx.profile.findUnique({
        where: { id: profileId },
        select: STANDING_SELECT,
      });
      if (freshStanding) this.assertErasableStanding(freshStanding, now);

      // Anonymise the profile. phone is UNIQUE + NOT NULL, so it becomes a non-dialable tombstone
      // (frees the real number for a genuine re-signup, which mints a fresh profile).
      //
      // DS15-02(b): idNumberHash is deliberately NOT nulled. It's a one-way HMAC (never raw PII), and it's
      // the sole signal duplicateIdAccountCount uses to flag a ban-evader re-registering with the SAME
      // national ID. Nulling it here blinded that check for anyone who ever erased; the raw idNumber
      // ciphertext (recoverable PII) is still scrubbed.
      await tx.profile.update({
        where: { id: profileId },
        data: {
          firstName: "Deleted",
          lastName: "User",
          email: null,
          idNumber: null,
          photoUrl: null,
          phone: `erased:${profileId}`,
        },
      });

      // Scrub rider PII if this profile is a rider; keep the row for the ledger.
      await tx.rider.updateMany({
        where: { profileId },
        data: {
          bikeReg: "",
          vehicleInfo: null,
          photoUrl: "",
          kycRef: null,
          kycDeclineReason: null,
          suspendReason: null,
          currentLat: null,
          currentLng: null,
          isOnline: false,
        },
      });

      // Remove the standalone PII stores + log every device out.
      await tx.address.deleteMany({ where: { profileId } });
      await tx.deviceToken.deleteMany({ where: { profileId } });
      await tx.session.deleteMany({ where: { profileId } });

      // Scrub the GPS trail on every order this user was part of (keep the status events themselves).
      await tx.orderEvent.updateMany({
        where: { order: { OR: [{ customerId: profileId }, { riderId: profileId }] } },
        data: { lat: null, lng: null },
      });

      // Scrub the precise location on every SOS this user raised (DS-01). `SosEvent` stores exact
      // lat/lng + raisedByProfileId and was added after this erasure logic — it was previously left
      // behind, retaining the most sensitive location data in the system (emergency moments) tied to
      // the (now anonymised) profile id forever. Keep the row (safety/incident ledger), null the GPS —
      // exactly as we do for OrderEvent above.
      await tx.sosEvent.updateMany({
        where: { raisedByProfileId: profileId },
        data: { lat: null, lng: null },
      });

      // Scrub the dialable contact PII embedded in the pickup/dropoff JSON of every order this profile
      // PLACED (as the customer — the party who supplied those contacts). Prisma can't patch a nested
      // JSON key in bulk, so read-modify-write each order; a single user's order count is bounded and
      // this runs once at erasure. Orders where the profile was only the rider aren't touched: those
      // contacts belong to the counterparty customer, not the erasing user.
      const placed = await tx.order.findMany({
        where: { customerId: profileId },
        select: { id: true, pickup: true, dropoff: true, note: true },
      });
      for (const o of placed) {
        const pickup = stripWaypointPhone(o.pickup);
        const dropoff = stripWaypointPhone(o.dropoff);
        // DS15-07: Order.note is customer-entered free-text delivery instructions ("call 077… if the gate's
        // locked") — the same class of dialable/address PII as the waypoint contactPhone, and the order is
        // retained forever as the ledger. Null it on the erasing customer's OWN orders only (like the
        // contactPhone scrub above: a note on an order the profile merely rode belongs to the counterparty
        // customer, not the erasing user, so those aren't in this customerId-scoped set).
        const clearNote = o.note != null;
        if (pickup === undefined && dropoff === undefined && !clearNote) continue;
        await tx.order.update({
          where: { id: o.id },
          data: {
            ...(pickup !== undefined ? { pickup } : {}),
            ...(dropoff !== undefined ? { dropoff } : {}),
            ...(clearNote ? { note: null } : {}),
          },
        });
      }
    });

    // DS15-05: post-commit, best-effort — pull an erased rider out of the TTL-less `rider:geo` Redis
    // sorted set. PG's is_online (now false) stays the nearbyRiders authority, so a missed eviction is
    // harmless; this just stops a ghost entry lingering in the GEOSEARCH candidate window / leaking Redis
    // memory. Mirrors the auto-hold eviction in order-lifecycle (never affects the committed erasure).
    if (isRider) {
      void this.gateway
        ?.evictRiderFromGeo(profileId)
        ?.catch((err) => this.logger.warn(`geo eviction after erasure failed for ${profileId}: ${(err as Error).message}`));
    }

    // DS15-03: post-commit, best-effort — purge the underlying GCS objects (KYC selfie/ID-document +
    // profile photo) now that the DB pointers are nulled. deleteObject swallows its own errors (404 =
    // success), so awaiting can't hard-fail the already-committed erasure. Without this the media
    // outlived the right-to-erasure request forever.
    if (this.storage) {
      const keys = [profile.photoUrl, profile.rider?.photoUrl].filter(
        (k): k is string => typeof k === "string" && k.length > 0,
      );
      for (const key of keys) {
        await this.storage.deleteObject(key);
      }
    }

    this.logger.log(`Account ${profileId} erased (anonymised in place)`);
    return { erased: true };
  }

  /** Retention sweep — drop expired GPS coords + lapsed sessions. Driven by Cloud Scheduler daily. */
  async purgeExpiredData(now: Date = new Date()): Promise<{ gpsScrubbed: number; sessionsPurged: number }> {
    const gpsCutoff = new Date(now.getTime() - this.env.GPS_RETENTION_DAYS * 86_400_000);
    const sessionCutoff = new Date(now.getTime() - this.env.SESSION_RETENTION_DAYS * 86_400_000);

    // Coords older than the window have no operational use (live position lives in Redis / rider row).
    const gps = await this.prisma.orderEvent.updateMany({
      where: { createdAt: { lt: gpsCutoff }, NOT: { lat: null } },
      data: { lat: null, lng: null },
    });

    // SOS coordinates are on the same GPS-retention clock (DS-01): an incident is actionable in the
    // moment, not months later, so past the window the precise location has no operational use and
    // must not linger. Keep the event row; null the coords.
    const sosGps = await this.prisma.sosEvent.updateMany({
      where: { createdAt: { lt: gpsCutoff }, NOT: { lat: null } },
      data: { lat: null, lng: null },
    });

    // Sessions that lapsed more than the window ago are dead auth artifacts.
    const sessions = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: sessionCutoff } },
    });

    this.logger.log(
      `Retention sweep: scrubbed ${gps.count} GPS events + ${sosGps.count} SOS coords, purged ${sessions.count} expired sessions`,
    );
    return { gpsScrubbed: gps.count + sosGps.count, sessionsPurged: sessions.count };
  }
}
