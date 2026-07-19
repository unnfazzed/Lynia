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

    // Class-C: GCS object keys for the item photos on the erasing customer's own orders, collected inside
    // the tx and deleted post-commit alongside the KYC/profile photos (deleteObject swallows its errors).
    const itemPhotoKeys: string[] = [];

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
      //
      // DS18-04 (TOCTOU CAS): the anonymise write is a CAS `updateMany` re-asserting the profile-level
      // standing predicate (`onHold`, the customer S·2 hold) in its WHERE — not a blind update by id. The
      // freshStanding re-read above is an unlocked SELECT feeding a JS gate; a customer-hold committing by an
      // admin between that read and this write would otherwise slip through blind. Re-asserting it here makes
      // the WRITE itself conditional (0 rows ⇒ the hold landed ⇒ abort), mirroring the DS-10 active-ride and
      // admin-orders.service CAS guards. The rider-level standing (ban/suspend/rider-hold/cooldown/kyc-lock)
      // is re-asserted on the rider CAS below, where those columns live.
      const anonymised = await tx.profile.updateMany({
        where: { id: profileId, onHold: false },
        data: {
          firstName: "Deleted",
          lastName: "User",
          email: null,
          idNumber: null,
          photoUrl: null,
          phone: `erased:${profileId}`,
        },
      });
      if (anonymised.count === 0) {
        throw new ConflictException({ reason: "account_on_hold", message: ERASE_BLOCKED_MESSAGE });
      }

      // Scrub rider PII if this profile is a rider; keep the row for the ledger. DS18-04: the WHERE also
      // re-asserts the rider-level standing predicate atomically (accountStatus not banned/suspended, not
      // on the sticky RH-01 hold, no live cooldown, KYC not two-decline-locked) — the same predicate
      // assertErasableStanding checks off the unlocked read. For a rider, a 0-row result means a restriction
      // landed between the freshStanding read and here → abort (below); a non-rider matches no row here
      // regardless (no riders row), so the count is only load-bearing when isRider.
      const riderScrub = await tx.rider.updateMany({
        where: {
          profileId,
          accountStatus: { notIn: [RiderAccountStatus.BANNED, RiderAccountStatus.SUSPENDED] },
          onHold: false,
          kycAttempts: { lt: KYC_LOCK_ATTEMPTS },
          OR: [{ cooldownUntil: null }, { cooldownUntil: { lte: now } }],
        },
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
      if (isRider && riderScrub.count === 0) {
        // A concurrent ban/suspend/hold/cooldown/KYC-lock landed after the freshStanding read — the CAS
        // predicate no longer matches. Abort so self-erasure can't race past a just-landed restriction.
        throw new ConflictException({ reason: "standing_changed", message: ERASE_BLOCKED_MESSAGE });
      }

      // WD-NEW / Class-C erasure completeness: the rider's last precise position lives in TWO columns —
      // the readable `current_lat`/`current_lng` (nulled above) AND the PostGIS `geog` point that the
      // nearby-rider index is actually built on. `geog` is a Prisma `Unsupported(...)` column, so a Prisma
      // `updateMany` CAN'T touch it (it's absent from the generated types) — it needs raw SQL. Without
      // this, an "erased" rider kept their exact last GPS location in `geog` forever, the same residual
      // location PII class DS-01 scrubbed for SosEvent/OrderEvent. Also null positionUpdatedAt so no stale
      // "live position" timestamp survives. No-op for a non-rider profile (no matching riders row).
      if (isRider) {
        await tx.$executeRaw`UPDATE riders SET geog = NULL, position_updated_at = NULL WHERE profile_id = ${profileId}::uuid`;
      }

      // DOC-16-01: `top_ups.phone` (the mobile-money number captured on every self-serve wallet top-up) is
      // the same class of dialable contact PII as the waypoint/note phones stripped below — but it lives
      // in its own table, referenced by riderId, so the profile/rider scrub above never reaches it. A
      // no-op for a non-rider profile (no TopUp rows can exist without a rider row). Keep the TopUp rows
      // themselves (financial ledger — CommissionLedger.topUpId references them); only null the phone.
      if (isRider) {
        await tx.topUp.updateMany({ where: { riderId: profileId, NOT: { phone: null } }, data: { phone: null } });
      }

      // KB-POD-DISPUTE Phase A cleanup: proof-of-drop evidence the erasing user captured AS THE RIDER is
      // their PII — the photo they took + their precise GPS at the door — the same location-PII class as
      // the OrderEvent GPS scrubbed below and the itemPhotoUrl photos scrubbed above. Collect the photo
      // keys for post-commit GCS deletion, then null all four proof columns (keep the order row as the
      // ledger). Scoped to riderId == profileId — a proof on an order this user merely placed belongs to
      // the counterparty rider, not the erasing user. No-op for a non-rider profile.
      //
      // DS18-01: `pickupPhotoKey` — the rider-captured proof-of-pickup photo (GCS key under
      // `pickup/<riderId>/`) — is the exact same class of rider-captured content, on a sibling column no
      // prior erasure pass traced (it escaped both PII_MANIFEST and NON_PII_COLUMNS). Collect + null it in
      // the SAME rider-scoped pass and purge its object post-commit alongside the delivery-proof photo.
      if (isRider) {
        const proofs = await tx.order.findMany({
          where: { riderId: profileId, OR: [{ NOT: { deliveryProofKey: null } }, { NOT: { pickupPhotoKey: null } }] },
          select: { deliveryProofKey: true, pickupPhotoKey: true },
        });
        for (const p of proofs) {
          if (p.deliveryProofKey) itemPhotoKeys.push(p.deliveryProofKey);
          if (p.pickupPhotoKey) itemPhotoKeys.push(p.pickupPhotoKey);
        }
        await tx.order.updateMany({
          where: { riderId: profileId },
          data: {
            deliveryProofKey: null,
            deliveryProofLat: null,
            deliveryProofLng: null,
            deliveryProofAt: null,
            pickupPhotoKey: null,
          },
        });
      }

      // DS18-02: user-authored free-text scrubs — the same class as Order.note (DS15-07), on the author's
      // erasure. Each keeps its host row (rating score / issue / report / cancelled order stay as the
      // ledger); only the free text the erasing user typed is nulled/emptied.
      //   • ratings.comment — nulled on the RATER's (byProfileId) own ratings (score itself retained).
      await tx.rating.updateMany({ where: { byProfileId: profileId, NOT: { comment: null } }, data: { comment: null } });
      //   • issues.description — the issue OPENER's free-text. NOT NULL column → emptied to "" (like bikeReg).
      await tx.issue.updateMany({ where: { openedByProfileId: profileId, NOT: { description: "" } }, data: { description: "" } });
      //   • reports.note — the REPORTER's free-text note (distinct from orders.note; table-qualified in the
      //     manifest so this isn't falsely covered by the orders.note entry).
      await tx.report.updateMany({ where: { reporterProfileId: profileId, NOT: { note: null } }, data: { note: null } });
      //   • orders.cancelReason — free text authored by whichever party cancelled; scrub when the erasing
      //     user is EITHER party to the order (customer OR rider), unlike the customer-only note scrub below.
      await tx.order.updateMany({
        where: { OR: [{ customerId: profileId }, { riderId: profileId }], NOT: { cancelReason: null } },
        data: { cancelReason: null },
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
        select: { id: true, pickup: true, dropoff: true, note: true, itemPhotoUrl: true },
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
        // Class-C (surfaced by the PII manifest guard): itemPhotoUrl is a customer-uploaded photo of the
        // parcel on their OWN placed order — user-supplied content that can incidentally show address
        // labels / IDs. The DB reference here is the GCS object key; null it and delete the object post-
        // commit (like the KYC/profile photos), so the media doesn't outlive the erasure request. Same
        // customerId scope as the note/waypoint scrub — a photo on an order the profile merely rode is the
        // counterparty's content, not the erasing user's.
        const clearItemPhoto = typeof o.itemPhotoUrl === "string" && o.itemPhotoUrl.length > 0;
        if (clearItemPhoto) itemPhotoKeys.push(o.itemPhotoUrl!);
        if (pickup === undefined && dropoff === undefined && !clearNote && !clearItemPhoto) continue;
        await tx.order.update({
          where: { id: o.id },
          data: {
            ...(pickup !== undefined ? { pickup } : {}),
            ...(dropoff !== undefined ? { dropoff } : {}),
            ...(clearNote ? { note: null } : {}),
            ...(clearItemPhoto ? { itemPhotoUrl: null } : {}),
          },
        });
      }
    });

    // DS15-05 / DS19-02: post-commit, best-effort — pull an erased rider out of BOTH live-supply planes,
    // the `rider:geo` Redis sorted set AND the board rooms, through the standing-demotion funnel. The
    // sessions were revoked in-transaction (session.deleteMany), but an already-open WebSocket authenticated
    // at handshake keeps its board-room subscriptions until it disconnects on its own — so a geo-only
    // eviction (the prior DS15-05 shape) left the erased rider a board ghost still receiving board pushes.
    // Every other demotion path (admin suspend/ban, KYC lapse, auto-hold, cancel/dispute-strike limits)
    // evicts both planes via evictRiderFromSupply; erasure is the funnel bypass this closes. PG's is_online
    // (now false) stays the nearbyRiders authority, so a missed eviction is harmless; never affects the
    // committed erasure (evictRiderFromSupply never throws — geo half is internally `.catch`ed).
    if (isRider) {
      void this.gateway
        ?.evictRiderFromSupply(profileId)
        ?.catch((err) => this.logger.warn(`supply eviction after erasure failed for ${profileId}: ${(err as Error).message}`));
    }

    // DS15-03: post-commit, best-effort — purge the underlying GCS objects (KYC selfie/ID-document +
    // profile photo) now that the DB pointers are nulled. deleteObject swallows its own errors (404 =
    // success), so awaiting can't hard-fail the already-committed erasure. Without this the media
    // outlived the right-to-erasure request forever.
    if (this.storage) {
      const keys = [profile.photoUrl, profile.rider?.photoUrl, ...itemPhotoKeys].filter(
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
