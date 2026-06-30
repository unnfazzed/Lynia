import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { KycStatus } from "@lynia/shared";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { KYC_VENDOR, type KycVendor } from "../kyc/kyc-vendor";
import { PrismaService } from "../prisma/prisma.service";

type Kyc = "pending" | "verified" | "failed";

/** A rider may go online only once KYC has passed (CONCEPT §5d gating). Pure for unit tests. */
export function canGoOnline(kycStatus: string): boolean {
  return kycStatus === KycStatus.VERIFIED;
}

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
    const rider = await this.prisma.rider.findUnique({ where: { profileId }, select: { kycStatus: true } });
    if (!rider) throw new NotFoundException("Not a rider");
    if (rider.kycStatus === "verified") throw new ConflictException("Already verified");
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
      select: { kycStatus: true, cooldownUntil: true },
    });
    if (!rider) throw new ForbiddenException("Not a rider");
    if (online && !canGoOnline(rider.kycStatus)) {
      throw new ForbiddenException("Rider is not verified yet");
    }
    if (online && rider.cooldownUntil && rider.cooldownUntil > new Date()) {
      throw new ForbiddenException("On cooldown after repeated cancellations — try again later");
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
  ): Promise<{ updated: number }> {
    const res = await this.prisma.rider.updateMany({
      where: { kycRef, OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }] },
      data: { kycStatus: status, idVerified: status === "verified", kycResolvedAt: eventAt },
    });
    return { updated: res.count };
  }

  /** Manual-review backstop (T7) — admin override when no vendor supports a ZIM ID. */
  async adminSetKyc(profileId: string, status: Kyc): Promise<{ profileId: string; kycStatus: Kyc }> {
    const rider = await this.prisma.rider.findUnique({ where: { profileId }, select: { profileId: true } });
    if (!rider) throw new NotFoundException("Rider not found");
    await this.prisma.rider.update({
      where: { profileId },
      data: { kycStatus: status, idVerified: status === "verified" },
    });
    return { profileId, kycStatus: status };
  }
}
