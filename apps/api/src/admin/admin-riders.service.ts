import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
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
import { TrackingGateway } from "../tracking/tracking.gateway";
import { auditData, fmtDate, fmtUntil, reportsFor, round, toTripRow } from "./admin.shared";

// Long enough that a reviewer working through the queue doesn't have the image expire mid-review;
// short enough that a leaked/cached admin response can't be used to fetch the photo indefinitely.
const KYC_PHOTO_READ_URL_TTL_SECONDS = 15 * 60;

@Injectable()
export class AdminRidersService {
  private readonly logger = new Logger(AdminRidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pii: PiiCryptoService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    // NotificationsModule is @Global, so no import wiring is needed to inject this.
    private readonly notifications: NotificationsService,
    // KB-BOARD-REVOKE: TrackingModule (imported by AdminModule) exports the gateway; suspend/ban call
    // kickRiderFromBoard post-commit so a now-ineligible rider stops getting board pushes mid-session.
    private readonly gateway: TrackingGateway,
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
        accountStatus: true,
        onHold: true,
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
      // Account standing (A-04) so the directory can distinguish an active rider from a
      // suspended/banned one — previously only visible on the detail page. `onHold` is the SEPARATE
      // reliability-hold flag (accountStatus has no on_hold member), surfaced so the directory can flag
      // an auto-held rider too.
      accountStatus: r.accountStatus,
      onHold: r.onHold,
      ratingAvg: r.ratingAvg,
      ratingCount: r.ratingCount,
      tripsCount: r.tripsCount,
      cancelStrikes: r.cancelStrikes,
      cooldownUntil: r.cooldownUntil?.toISOString() ?? null,
      duplicateIdFlag: r.duplicateIdFlag,
    }));
  }

  /**
   * Ops wallet view for a rider (DOC-16-03): the prepaid commission balance + the recent append-only
   * ledger, so ops can actually see a rider's float and reconcile a manual credit from the console. The
   * credit action itself is `POST riders/:id/wallet-credit` (WalletService.creditManual). Read-only.
   * A rider with no wallet touch yet has no CommissionAccount row → balance "0.00", empty ledger.
   */
  async walletView(profileId: string) {
    const [account, ledger] = await Promise.all([
      this.prisma.commissionAccount.findUnique({ where: { riderId: profileId }, select: { balance: true } }),
      this.prisma.commissionLedger.findMany({
        where: { riderId: profileId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          note: true,
          actor: true,
          orderId: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      // Always 2dp (Decimal(10,2).toString() keeps scale; the no-account fallback is an explicit "0.00").
      balance: account ? account.balance.toString() : "0.00",
      ledger: ledger.map((l) => ({
        id: l.id,
        type: l.type,
        amount: l.amount.toString(),
        balanceAfter: l.balanceAfter.toString(),
        note: l.note ?? null,
        actor: l.actor ?? null,
        orderId: l.orderId ?? null,
        at: l.createdAt.toISOString(),
      })),
    };
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
   * A rider standing change (suspend/ban) doesn't touch an order they're already assigned to — the
   * lifecycle mutations only check `order.riderId === riderId`, not standing — so a customer whose
   * rider is suspended or banned mid-delivery previously heard nothing about it. Best-effort, post-
   * commit, never throws: finds that rider's currently-active order(s) and tells each customer their
   * rider's status changed, without cancelling anything (that stays a deliberate, separate ops call —
   * see the admin console's "still on a live delivery" banner on the rider page).
   */
  private async notifyCustomersOfRiderStandingChange(profileId: string, resolved = false): Promise<void> {
    // UX18-05: liftRider — the direct undo of a suspension, and the one action most likely to fire while
    // the SAME rider is still assigned to the SAME active order — never resolved the alarming "we're
    // reviewing this trip" notice suspend/ban left on the customer's feed. `resolved=true` (passed only
    // from liftRider) swaps in honest "this is over, your rider is back" copy and a distinct audit action
    // so the two notices read as separate feed rows instead of one that silently repeats.
    const action = resolved ? "order.rider_standing_resolved" : "order.rider_standing_notice";
    const copy = resolved
      ? {
          title: "Your delivery is back on track",
          body: "The review of your assigned rider is complete — your delivery is continuing as normal.",
        }
      : {
          title: "An update on your delivery",
          body: "There's a change with your assigned rider — our team is reviewing this trip.",
        };
    try {
      const activeOrders = await this.prisma.order.findMany({
        where: { riderId: profileId, status: { in: ACTIVE_RIDE_STATUSES } },
        select: { id: true, customerId: true },
      });
      await Promise.all(
        activeOrders.map(async (o) => {
          // UX17-02: the push above is best-effort and easily missed (backgrounded app / dead FCM token),
          // and the rider.suspend/ban audit is targeted at the RIDER's id — so feedForUser's account-status
          // query never surfaces this to the CUSTOMER. Write a durable AuditLog row targeted at the ORDER id
          // (so feedForUser can match it against the customer's own orders) as the feed fallback. `note`
          // carries the rider's profileId for traceability (AuditLog.note is a nullable free-text column).
          // In the SAME best-effort try/catch as the push — a DB failure here mustn't throw (this whole
          // method is already fire-and-forget post-commit), so a per-order write failure can't roll back the
          // committed standing change nor block the other orders' notices.
          await this.prisma.auditLog
            .create({
              data: { actor: "system:rider-standing-notice", action, target: o.id, note: profileId },
            })
            .catch((err: unknown) =>
              this.logger.warn(`${action} audit for order ${o.id} failed: ${(err as Error).message}`),
            );
          await this.notifications.notifyProfiles([o.customerId], {
            title: copy.title,
            body: copy.body,
            data: { orderId: o.id, kind: "account" },
          });
        }),
      );
    } catch (err) {
      // notifyProfiles itself never throws; this only guards the findMany. Either way a notify miss
      // can't roll back the already-committed standing change.
      this.logger.warn(`notifyCustomersOfRiderStandingChange(${profileId}) failed: ${(err as Error).message}`);
    }
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
      // A permanent ban outranks a suspension and is only undone by a deliberate dedicated action — never
      // downgraded as a side effect. Without this guard, `ban → suspend` silently demotes banned→suspended,
      // and a subsequent `liftRider` (whose ban-permanence check only fires on accountStatus===BANNED) then
      // reinstates the rider to active — defeating the very invariant liftRider exists to protect. Mirror
      // that guard here so a banned rider can't be laundered back to active through two ordinary actions.
      if (rider.accountStatus === RiderAccountStatus.BANNED) {
        throw new ConflictException("A banned rider can't be suspended — reinstating a ban is a separate action.");
      }
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
      // FRAUD P2-3: revoke every live refresh session in the SAME transaction. JwtAuthGuard only verifies
      // the access-token signature — it never re-reads accountStatus — so without this a suspended rider
      // keeps minting fresh access tokens via /auth/refresh indefinitely (the short access-token TTL is the
      // only bound, but refresh renews it forever). Revoking the sessions closes the refresh renewal; the
      // residual is one access-token TTL, the standard JWT trade-off. `refresh()` also re-checks standing
      // as a backstop for any demotion path that forgets this.
      await tx.session.updateMany({ where: { profileId, revokedAt: null }, data: { revokedAt: new Date() } });
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
    // KB-BOARD-REVOKE + DS15-05: a suspended rider is no longer board-eligible and must not linger as a
    // GEOSEARCH ghost — evict from BOTH live-supply planes (board rooms + `rider:geo` Redis index) through
    // the single standing-demotion funnel so this can't be half-applied. Best-effort, post-commit; never
    // throws, never affects the committed suspension.
    void this.gateway.evictRiderFromSupply(profileId);
    void this.notifyCustomersOfRiderStandingChange(profileId);
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
          // RH-01: an explicit admin lift releases ANY hold, including a velocity/fraud hold — so clear
          // heldReason too (the score bump alone wouldn't release a velocity hold, which is sticky).
          heldReason: null,
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
    // UX18-05: suspendRider/banRider both tell the customer on any active order their rider's standing
    // changed ("we're reviewing this trip") — liftRider is the direct undo, most likely to fire while that
    // SAME order is still live, but never resolved that notice. resolved=true is a no-op when the rider has
    // no active order (findMany returns empty), matching suspendRider/banRider's unconditional call.
    void this.notifyCustomersOfRiderStandingChange(profileId, true);
    return result;
  }

  /**
   * A-04 permanent ban → `accountStatus=banned` with the reason recorded in `suspendReason`. Reason is
   * required. Mutation + audit in one transaction.
   */
  async banRider(actor: string, profileId: string, input: { reason: string; note?: string | null }) {
    const result = await this.prisma.$transaction(async (tx) => {
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
      // FRAUD P2-3: revoke every live refresh session in the same transaction (see suspendRider) — a ban
      // must not leave the rider able to renew access tokens indefinitely via /auth/refresh.
      await tx.session.updateMany({ where: { profileId, revokedAt: null }, data: { revokedAt: new Date() } });
      const audit = await tx.auditLog.create({
        data: auditData(actor, "rider.ban", profileId, input.reason, input.note),
        select: { id: true },
      });
      return { id: profileId, accountStatus: RiderAccountStatus.BANNED, auditId: audit.id };
    });
    // Best-effort, post-commit: tell the banned rider themselves — suspendRider/liftRider/clearHold all
    // push the rider directly, but banRider was the one standing-change action in this file that only
    // notified the CUSTOMERS on the rider's active orders and never the rider, leaving a missed push here
    // the rider's only signal (the durable `rider.ban` feed row is still there as a fallback either way).
    void this.notifications.notifyProfiles([profileId], {
      title: "Account blocked",
      body: "Your account was blocked — contact support for details.",
      data: { kind: "account" },
    });
    // KB-BOARD-REVOKE + DS15-05: evict from BOTH live-supply planes (board + geo) through the standing-
    // demotion funnel, mirroring suspendRider. Best-effort, post-commit; never throws.
    void this.gateway.evictRiderFromSupply(profileId);
    void this.notifyCustomersOfRiderStandingChange(profileId);
    return result;
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
        // RH-01: an explicit admin clear-hold releases ANY hold, including the FRAUD P0-3 velocity/fraud
        // hold that the score hysteresis deliberately never self-clears — so reset heldReason to null too.
        data: { onHold: false, heldReason: null, reliabilityScore: Math.max(rider.reliabilityScore, RELIABILITY.ON_HOLD_CLEAR_AT) },
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
    const [liveOrders, statusCounts, recent, reports, account] = await Promise.all([
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
      // NEW-2 (docs/KNOWN_BUGS.md): the account row is lazily upserted on first wallet touch — no row yet
      // means no top-up/debit has ever happened, i.e. nothing owed. `balance` is only ever negative when
      // ride debits (ratePct > 0) push it below zero; a positive/zero balance is a credit, never "owed".
      this.prisma.commissionAccount.findUnique({ where: { riderId: id }, select: { balance: true } }),
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
      // NEW-2: was hardcoded "0.00" ("wallet deferred") — the wallet has since shipped, so this went from
      // "always true at 0%" to "affirmatively wrong the moment ratePct > 0 or the rider carries a debit
      // balance". Reads the real CommissionAccount row now; "owed" is the negative-balance magnitude, a
      // zero/positive balance (incl. no row yet) is never owed.
      commission: round(Math.max(0, -Number(account?.balance ?? 0))).toFixed(2),
      // Orders this rider is actively riding right now — surfaced so ops sees at a glance whether a
      // suspend/ban leaves a live delivery orphaned mid-trip (the rider keeps the app-level ability to
      // advance/confirm it; standing changes don't touch an already-assigned order). The trail below
      // lists recent orders with status, so ops can identify which one from there.
      activeOrders: liveOrders,
      // How many times this rider has been reported by customers, plus the recent entries (fault signal
      // for ops). Additive to the D-2 RiderDetail shape.
      reports: reports.count,
      reportLog: reports.recent,
      joined: fmtDate(rider.profile.createdAt),
      trail: recent.map((o) => toTripRow(o)),
    };
  }
}
