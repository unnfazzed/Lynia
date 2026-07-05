import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { KycStatus, RiderAccountStatus } from "@lynia/shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { KYC_VENDOR, type KycVendor } from "../kyc/kyc-vendor";
import { PrismaService } from "../prisma/prisma.service";

type Kyc = "pending" | "verified" | "failed";

/** A rider may go online only once KYC has passed (CONCEPT §5d gating). Pure for unit tests. */
export function canGoOnline(kycStatus: string): boolean {
  return kycStatus === KycStatus.VERIFIED;
}

/** Why a rider was refused going online — a machine-readable tag the app keys off to show the right
 *  state (verify your ID / account suspended / on hold / on cooldown). */
export type OnlineRefusal = "kyc" | "suspended" | "on_hold" | "cooldown";

/**
 * The online-gate (Q2): the FIRST failed precondition, or null when the rider may go online. A rider
 * goes online only when KYC is verified, the account is `active` (admin-owned — read here, never
 * written), reliability is not `on_hold`, and any no-show cooldown has elapsed. Pure for unit tests.
 */
export function onlineRefusalReason(
  rider: { kycStatus: string; accountStatus: string; onHold: boolean; cooldownUntil: Date | null },
  now: Date = new Date(),
): OnlineRefusal | null {
  if (!canGoOnline(rider.kycStatus)) return "kyc";
  if (rider.accountStatus !== RiderAccountStatus.ACTIVE) return "suspended";
  if (rider.onHold) return "on_hold";
  if (rider.cooldownUntil && rider.cooldownUntil > now) return "cooldown";
  return null;
}

/** Rider-facing copy per refusal reason. The structured `reason` (not this string) is the contract. */
const REFUSAL_MESSAGE: Record<OnlineRefusal, string> = {
  kyc: "Rider is not verified yet",
  suspended: "Your rider account is suspended",
  on_hold: "You're on hold — complete deliveries to raise your reliability score",
  cooldown: "On cooldown after repeated cancellations — try again later",
};

@Injectable()
export class RiderService {
  private readonly logger = new Logger(RiderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
    @Inject(KYC_VENDOR) private readonly vendor: KycVendor,
  ) {}

  /** Low-friction signup completion: name + national ID (CONCEPT §5d). */
  async completeProfile(
    profileId: string,
    data: { firstName: string; lastName: string; idNumber: string },
  ): Promise<{ ok: true }> {
    await this.prisma.profile.update({ where: { id: profileId }, data });
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
        },
      }),
    ]);
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

  async setOnline(profileId: string, online: boolean): Promise<{ online: boolean }> {
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
    }
    await this.prisma.rider.update({
      where: { profileId },
      data: { isOnline: online, lastHeartbeatAt: online ? new Date() : undefined },
    });
    return { online };
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
    status: "verified" | "failed",
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
        // why, and clear any stale reason on a verify. NOT a kycAttempts change — the attempt counter
        // is the admin A-02 decline path's, not the vendor webhook's.
        ...(status === "failed" ? { kycDeclineReason: reason ?? null } : { kycDeclineReason: null }),
      },
    });
    return { updated: res.count };
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
   */
  async adminSetKyc(
    profileId: string,
    status: Kyc,
    reasonCode?: string | null,
  ): Promise<{ profileId: string; kycStatus: Kyc; kycAttempts: number; locked: boolean }> {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: { profileId: true, kycAttempts: true },
    });
    if (!rider) throw new NotFoundException("Rider not found");

    if (status === "failed") {
      // Decline: record the reason and bump the attempt counter. The increment is the lock's source of
      // truth — a second decline lands at >= 2 and retryKyc refuses to mint a third session.
      const updated = await this.prisma.rider.update({
        where: { profileId },
        data: {
          kycStatus: "failed",
          idVerified: false,
          kycDeclineReason: reasonCode ?? null,
          kycAttempts: { increment: 1 },
        },
        select: { kycAttempts: true },
      });
      return {
        profileId,
        kycStatus: "failed",
        kycAttempts: updated.kycAttempts,
        locked: updated.kycAttempts >= 2,
      };
    }

    // Approve / pending reset: no counter change. Clearing the decline reason on approve keeps the
    // rider app from showing a stale "you were declined for …" once they're verified.
    await this.prisma.rider.update({
      where: { profileId },
      data: {
        kycStatus: status,
        idVerified: status === "verified",
        ...(status === "verified" ? { kycDeclineReason: null } : {}),
      },
    });
    return { profileId, kycStatus: status, kycAttempts: rider.kycAttempts, locked: rider.kycAttempts >= 2 };
  }
}
