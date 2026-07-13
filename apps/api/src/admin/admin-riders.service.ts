import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  ACTIVE_RIDE_STATUSES,
  type KycStatus,
  RELIABILITY,
  RiderAccountStatus,
} from "@lynia/shared";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { maskPhone } from "../common/phone-mask";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { auditData, fmtDate, fmtUntil, reportsFor, round, toTripRow } from "./admin.shared";

// Long enough that a reviewer working through the queue doesn't have the image expire mid-review;
// short enough that a leaked/cached admin response can't be used to fetch the photo indefinitely.
const KYC_PHOTO_READ_URL_TTL_SECONDS = 15 * 60;

@Injectable()
export class AdminRidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: PiiCryptoService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    // NotificationsModule is @Global, so no import wiring is needed to inject this.
    private readonly notifications: NotificationsService,
  ) {}

  /** Rider roster for ops — the KYC review queue when filtered to `pending`. */
  async listRiders(kyc?: KycStatus) {
    const riders = await this.prisma.rider.findMany({
      where: kyc ? { kycStatus: kyc } : {},
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        profileId: true,
        bikeReg: true,
        kycStatus: true,
        kycRef: true,
        idVerified: true,
        isOnline: true,
        ratingAvg: true,
        ratingCount: true,
        tripsCount: true,
        cancelStrikes: true,
        cooldownUntil: true,
        duplicateIdFlag: true,
        profile: { select: { firstName: true, lastName: true, phone: true } },
      },
    });

    // A-03 (P0): mask each rider's phone UNLESS they're on a LIVE order right now. The reveal set is
    // ACTIVE_RIDE_STATUSES (mid-delivery) — NOT PHONE_REVEAL_STATUSES, which includes the permanent
    // terminal states (delivered/completed/undelivered): using those would leave any rider who ever
    // finished one order unmasked forever, defeating the roster-scrape protection. The per-order
    // reveal window (getSnapshot) still uses PHONE_REVEAL_STATUSES — that's scoped to one live order.
    const revealingRiderIds = new Set(
      (
        await this.prisma.order.findMany({
          where: { riderId: { in: riders.map((r) => r.profileId) }, status: { in: ACTIVE_RIDE_STATUSES } },
          select: { riderId: true },
          distinct: ["riderId"],
        })
      ).flatMap((o) => (o.riderId ? [o.riderId] : [])),
    );

    return riders.map((r) => ({
      profileId: r.profileId,
      name: `${r.profile.firstName} ${r.profile.lastName}`.trim(),
      phone: revealingRiderIds.has(r.profileId) ? r.profile.phone : maskPhone(r.profile.phone),
      bikeReg: r.bikeReg,
      kycStatus: r.kycStatus,
      kycRef: r.kycRef,
      idVerified: r.idVerified,
      isOnline: r.isOnline,
      ratingAvg: r.ratingAvg,
      ratingCount: r.ratingCount,
      tripsCount: r.tripsCount,
      cancelStrikes: r.cancelStrikes,
      cooldownUntil: r.cooldownUntil?.toISOString() ?? null,
      duplicateIdFlag: r.duplicateIdFlag,
    }));
  }

  /**
   * Single-rider KYC review detail (admin A-02) — the doc-review screen behind the KYC queue. Returns
   * the real, persisted KYC state: status, the resubmission counter + derived lock/attempt, the last
   * decline reason, and the applicant fields ops compare against the documents. Phone is masked (A-03)
   * — the reviewer matches the ID number, not the phone.
   *
   * Didit's granular scores (face-match, doc authenticity, liveness) are NOT persisted in the pilot —
   * only the overall verdict flows through the webhook into `kycStatus`. Those fields are therefore
   * omitted here; the console renders the checks panel from `kycStatus` + the reviewer's own compare.
   */
  async getKycReview(profileId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: {
        profileId: true,
        bikeReg: true,
        kycStatus: true,
        kycRef: true,
        kycAttempts: true,
        kycDeclineReason: true,
        idVerified: true,
        duplicateIdFlag: true,
        updatedAt: true,
        photoUrl: true,
        profile: { select: { firstName: true, lastName: true, phone: true, idNumber: true, idNumberHash: true } },
      },
    });
    if (!rider) return null;

    // The reviewer's whole job is comparing this photo against the applicant fields below — without
    // it they're approving/declining blind. `photoUrl` on the row is the GCS object KEY (uploads.
    // controller mints the write URL at capture time; this mints the matching read URL on demand, so
    // the object store is never public and the URL is only ever live for one review session).
    // Best-effort: a signing failure shouldn't block the rest of the review from loading.
    const photoUrl = rider.photoUrl
      ? await this.storage.createReadUrl(rider.photoUrl, KYC_PHOTO_READ_URL_TTL_SECONDS).catch(() => null)
      : null;

    // A-04 duplicate-account guard: the live set of OTHER accounts sharing this national ID, so the
    // reviewer can compare them before approving (a national ID isn't unique — phone is — so a second
    // SIM can re-onboard under the same ID). Recomputed here rather than trusting the become-rider
    // snapshot: a colliding account may have been created, edited or deleted since. Phones are masked
    // (A-03) — the reviewer matches on the ID, not the phone.
    const duplicateIdAccounts = rider.profile.idNumberHash
      ? (
          await this.prisma.profile.findMany({
            where: { idNumberHash: rider.profile.idNumberHash, id: { not: rider.profileId } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              role: true,
              rider: { select: { kycStatus: true, accountStatus: true } },
            },
            orderBy: { createdAt: "asc" },
          })
        ).map((p) => ({
          id: p.id,
          name: `${p.firstName} ${p.lastName}`.trim(),
          phone: maskPhone(p.phone),
          role: p.role,
          kycStatus: p.rider?.kycStatus ?? null,
          accountStatus: p.rider?.accountStatus ?? null,
        }))
      : [];

    // kycAttempts counts declines. The current attempt number is declines + 1 (1 on first review, 2 on
    // the single allowed resubmit). >= 2 declines = locked → support, no further attempts.
    const locked = rider.kycAttempts >= 2;
    return {
      id: rider.profileId,
      name: `${rider.profile.firstName} ${rider.profile.lastName}`.trim(),
      phone: maskPhone(rider.profile.phone),
      // Decrypt for the reviewer — the KYC review is the one place the full national ID is shown (LR8).
      idNumber: this.pii.decryptId(rider.profile.idNumber),
      // Short-lived signed GET URL (or null: no photo yet, or signing failed) — never the raw object
      // key, and never a public bucket URL.
      photoUrl,
      bike: rider.bikeReg,
      status: rider.kycStatus,
      kycRef: rider.kycRef,
      kycAttempts: rider.kycAttempts,
      attempt: Math.min(rider.kycAttempts + 1, 2),
      locked,
      declineReason: rider.kycDeclineReason,
      submittedAt: rider.updatedAt.toISOString(),
      // A-04: the flag persisted at onboarding, and the live collision set the reviewer acts on.
      // duplicateIdFlag reflects onboarding; duplicateIdAccounts.length reflects now — either non-empty
      // means "review the ID before approving".
      duplicateIdFlag: rider.duplicateIdFlag,
      duplicateIdAccounts,
    };
  }

  /**
   * A-04 rider suspend. Sets `accountStatus=suspended` + the admin reason (only `active` riders may go
   * online, so this pulls them offline-eligible) AND writes the audit row in ONE transaction. Reason is
   * required (enforced by the controller's zod body). 404s when the id isn't a rider.
   */
  async suspendRider(actor: string, profileId: string, input: { reason: string; note?: string | null }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({ where: { profileId }, select: { accountStatus: true } });
      if (!rider) throw new NotFoundException("Rider not found");
      // DS13-04: CAS on the observed accountStatus instead of a blind update-by-id (mirrors DS-03 in
      // admin-orders.service). The findUnique takes no row lock, so a concurrent standing change (e.g. a
      // ban committing between the read and this write) would otherwise be silently clobbered back to
      // suspended. Guarding on the observed status makes the two serialize: 0 rows ⇒ the row moved ⇒ 409.
      const changed = await tx.rider.updateMany({
        where: { profileId, accountStatus: rider.accountStatus },
        // P2-1: force offline in the same write so a rider online at suspend-time is pulled off the
        // board immediately and can't keep bidding/being selected (accountStatus alone is a no-op
        // against an already-online rider).
        data: { accountStatus: RiderAccountStatus.SUSPENDED, suspendReason: input.reason, isOnline: false },
      });
      if (changed.count === 0) throw new ConflictException("Rider changed — refresh and try again");
      const audit = await tx.auditLog.create({
        data: auditData(actor, "rider.suspend", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, accountStatus: RiderAccountStatus.SUSPENDED, auditId: audit.id };
    });
    // Best-effort, post-commit: tell the rider their standing changed (nothing surfaced this before).
    // notifyProfiles never throws — a push miss can't affect the committed suspension.
    void this.notifications.notifyProfiles([profileId], {
      title: "Account paused",
      body: "Your account was paused — open the app for details.",
      data: { kind: "account" },
    });
    return result;
  }

  /**
   * A-04 lift a suspension → back to `active`, clearing the suspend reason. Reason is optional.
   * Mutation + audit in one transaction.
   */
  async liftRider(actor: string, profileId: string, input: { reason?: string | null; note?: string | null }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({
        where: { profileId },
        select: { accountStatus: true, onHold: true, reliabilityScore: true },
      });
      if (!rider) throw new NotFoundException("Rider not found");
      // A lift restores access and clears a reliability hold. It does NOT undo a permanent ban —
      // reinstating a banned rider must be a separate, deliberate action, not a side effect of "lift".
      if (rider.accountStatus === RiderAccountStatus.BANNED) {
        throw new ConflictException("A banned rider can't be lifted — reinstating a ban is a separate action.");
      }
      // Lift is an un-suspend, not a hold-clear — an active-but-on_hold rider (never suspended) uses
      // `clearHold` below instead, so the two audit trails ("suspension lifted" vs "hold cleared")
      // stay distinct.
      if (rider.accountStatus !== RiderAccountStatus.SUSPENDED) {
        throw new ConflictException("Rider is not suspended");
      }
      // DS13-04: CAS on the FULL observed state the guard + score recompute depend on (accountStatus +
      // onHold + reliabilityScore). Without it, op B's ban committing after the BANNED check above would be
      // un-banned by this blind write, and the Math.max score recompute off a stale read could clobber a
      // just-committed velocity auto-hold (markUndelivered, which does take lockRiderRow). 0 rows ⇒ 409.
      const changed = await tx.rider.updateMany({
        where: {
          profileId,
          accountStatus: rider.accountStatus,
          onHold: rider.onHold,
          reliabilityScore: rider.reliabilityScore,
        },
        data: {
          accountStatus: RiderAccountStatus.ACTIVE,
          suspendReason: null,
          // Clear the reliability lockout: on_hold otherwise has no escape (recovery needs online
          // completions, which the hold blocks). Raise the score to the clear threshold if it's below.
          onHold: false,
          reliabilityScore: Math.max(rider.reliabilityScore, RELIABILITY.ON_HOLD_CLEAR_AT),
        },
      });
      if (changed.count === 0) throw new ConflictException("Rider changed — refresh and try again");
      const audit = await tx.auditLog.create({
        data: auditData(actor, "rider.lift", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, accountStatus: RiderAccountStatus.ACTIVE, auditId: audit.id };
    });
    // Best-effort, post-commit: tell the rider they're back in good standing (recovery was silent before).
    void this.notifications.notifyProfiles([profileId], {
      title: "Account restored",
      body: "Your account is back in good standing — you can go online again.",
      data: { kind: "account" },
    });
    return result;
  }

  /**
   * A-04 permanent ban → `accountStatus=banned` with the reason recorded in `suspendReason`. Reason is
   * required. Mutation + audit in one transaction.
   */
  async banRider(actor: string, profileId: string, input: { reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({ where: { profileId }, select: { accountStatus: true } });
      if (!rider) throw new NotFoundException("Rider not found");
      // DS13-04: CAS on the observed accountStatus (mirrors DS-03) so a concurrent standing change can't
      // be silently clobbered between the read and this write. 0 rows ⇒ the row moved ⇒ 409.
      const changed = await tx.rider.updateMany({
        where: { profileId, accountStatus: rider.accountStatus },
        // P2-1: force offline in the same write so a rider online at ban-time is pulled off the board
        // immediately and can't keep bidding/being selected.
        data: { accountStatus: RiderAccountStatus.BANNED, suspendReason: input.reason, isOnline: false },
      });
      if (changed.count === 0) throw new ConflictException("Rider changed — refresh and try again");
      const audit = await tx.auditLog.create({
        data: auditData(actor, "rider.ban", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, accountStatus: RiderAccountStatus.BANNED, auditId: audit.id };
    });
  }

  /**
   * A-04 clear an auto reliability hold on an ACTIVE (never-suspended) rider. `on_hold` trips when
   * `reliabilityScore` drops below `RELIABILITY.ON_HOLD_BELOW` and is documented to clear via
   * `RECOVER_PER_COMPLETION` deliveries — but the online-gate (`online-gate.ts`) refuses to let an
   * on_hold rider go online at all, so that self-recovery path can never actually run: without this
   * action an on_hold rider has no way back, ever. `liftRider` above deliberately won't touch a
   * non-suspended rider, so this is the only place that clears the flag for that state. Mutation +
   * audit in one transaction.
   */
  async clearHold(actor: string, profileId: string, input: { reason?: string | null; note?: string | null }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({
        where: { profileId },
        select: { accountStatus: true, onHold: true, reliabilityScore: true },
      });
      if (!rider) throw new NotFoundException("Rider not found");
      if (rider.accountStatus !== RiderAccountStatus.ACTIVE) {
        throw new ConflictException("Clear-hold only applies to an active rider — use lift/ban for suspended/banned.");
      }
      if (!rider.onHold) throw new ConflictException("Rider is not on hold");
      // DS13-04: CAS on the FULL observed state (accountStatus + onHold + reliabilityScore) the guard +
      // score recompute depend on. The velocity auto-hold (markUndelivered, FRAUD P0-3 #198) takes
      // lockRiderRow and sets onHold=true; an admin clear racing it must not overwrite that just-committed
      // hold off a stale read. 0 rows ⇒ the row moved under us ⇒ 409 (ops refreshes and re-decides).
      const changed = await tx.rider.updateMany({
        where: {
          profileId,
          accountStatus: rider.accountStatus,
          onHold: rider.onHold,
          reliabilityScore: rider.reliabilityScore,
        },
        data: { onHold: false, reliabilityScore: Math.max(rider.reliabilityScore, RELIABILITY.ON_HOLD_CLEAR_AT) },
      });
      if (changed.count === 0) throw new ConflictException("Rider changed — refresh and try again");
      const audit = await tx.auditLog.create({
        data: auditData(actor, "rider.clear_hold", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, onHold: false, auditId: audit.id };
    });
    // Best-effort, post-commit: tell the rider their hold cleared and they can go online again.
    void this.notifications.notifyProfiles([profileId], {
      title: "Account restored",
      body: "Your account is back in good standing — you can go online again.",
      data: { kind: "account" },
    });
    return result;
  }

  /**
   * Rider detail (roster drill-in). Real stats (trips, rating, cancel strikes, cooldown), bike/docs,
   * and the recent-trips table. Phone is masked UNLESS the rider is on a LIVE order right now
   * (ACTIVE_RIDE_STATUSES — live-only, not the terminal-inclusive set, so a rider who once finished an
   * order isn't unmasked forever; same rule as listRiders). Returns null when the id isn't a rider.
   *
   * `status` reports the A-04 account state machine first (suspended/banned, with the stored admin
   * reason), then `on_hold` (an active rider the reliability engine has locked out — see `clearHold`
   * above), then the cooldown/online derivation for active riders.
   * Commission is prepaid per-ride at 0% during the launch period, so nothing is owed — `commission`
   * is "0.00" until the rate turns on and the prepaid wallet ships (deferred).
   */
  async getRiderDetail(id: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId: id },
      select: {
        profileId: true,
        bikeReg: true,
        kycStatus: true,
        isOnline: true,
        ratingAvg: true,
        ratingCount: true,
        tripsCount: true,
        cancelStrikes: true,
        cooldownUntil: true,
        accountStatus: true,
        suspendReason: true,
        onHold: true,
        reliabilityScore: true,
        profile: { select: { firstName: true, lastName: true, phone: true, createdAt: true } },
      },
    });
    if (!rider) return null;

    const now = Date.now();
    const [liveOrders, statusCounts, recent, reports] = await Promise.all([
      this.prisma.order.count({ where: { riderId: id, status: { in: ACTIVE_RIDE_STATUSES } } }),
      this.prisma.order.groupBy({ by: ["status"], where: { riderId: id }, _count: { _all: true } }),
      this.prisma.order.findMany({
        where: { riderId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          status: true,
          proposedFare: true,
          agreedFare: true,
          pickup: true,
          dropoff: true,
          createdAt: true,
        },
      }),
      reportsFor(this.prisma, id),
    ]);

    const onCooldown = !!rider.cooldownUntil && rider.cooldownUntil.getTime() > now;
    // Account state (A-04) outranks the activity derivation: a suspended/banned/on_hold rider can't
    // go online, so showing "offline" would hide the reason they're off the board.
    const status: "online" | "offline" | "cooldown" | "suspended" | "banned" | "on_hold" =
      rider.accountStatus === RiderAccountStatus.SUSPENDED
        ? "suspended"
        : rider.accountStatus === RiderAccountStatus.BANNED
          ? "banned"
          : rider.onHold
            ? "on_hold"
            : onCooldown
              ? "cooldown"
              : rider.isOnline
                ? "online"
                : "offline";

    // Completion = delivered-or-completed over every order ever assigned to this rider. Approximate
    // (a customer-side cancel still counts in the denominator) but real, schema-backed data.
    const totalAssigned = statusCounts.reduce((n, r) => n + r._count._all, 0);
    const succeeded = statusCounts
      .filter((r) => r.status === "completed" || r.status === "delivered")
      .reduce((n, r) => n + r._count._all, 0);
    const completion = totalAssigned ? `${round((succeeded / totalAssigned) * 100)}%` : "—";

    return {
      id: rider.profileId,
      name: `${rider.profile.firstName} ${rider.profile.lastName}`.trim(),
      phone: liveOrders > 0 ? rider.profile.phone : maskPhone(rider.profile.phone),
      bike: rider.bikeReg,
      kyc: rider.kycStatus,
      status,
      cooldown: onCooldown ? fmtUntil(rider.cooldownUntil!, now) : undefined,
      // The admin reason recorded at suspend/ban time (or "settlement_overdue" from the auto-pause).
      suspendReason: rider.suspendReason ?? undefined,
      // Only meaningful to show while on_hold — the threshold to clear is RELIABILITY.ON_HOLD_CLEAR_AT.
      reliabilityScore: status === "on_hold" ? rider.reliabilityScore : undefined,
      trips: rider.tripsCount,
      rating: rider.ratingCount > 0 ? rider.ratingAvg.toFixed(1) : null,
      ratingCount: rider.ratingCount,
      completion,
      strikes: rider.cancelStrikes,
      commission: "0.00", // prepaid per-ride at 0% during launch — nothing owed (wallet deferred)
      // How many times this rider has been reported by customers, plus the recent entries (fault signal
      // for ops). Additive to the D-2 RiderDetail shape.
      reports: reports.count,
      reportLog: reports.recent,
      joined: fmtDate(rider.profile.createdAt),
      trail: recent.map((o) => toTripRow(o)),
    };
  }
}
