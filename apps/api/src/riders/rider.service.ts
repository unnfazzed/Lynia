import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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
      const submission = await this.vendor.submit(profileId);
      kycRef = submission.ref;
      verificationUrl = submission.url;
    }

    // QA/test: the stub provider has no real vendor and never calls back, so in auto mode it
    // acts as an instant pass — the rider is created already verified and can go online, making
    // the full rider flow (online → bid → deliver → OTP) testable with no Didit account. A real
    // provider (didit) still starts pending and is resolved by the vendor callback or the admin
    // backstop. Flip KYC_PROVIDER=didit before launch (see FOUNDER-RUNBOOK).
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

  /** Vendor callback result → flip the rider's KYC status. */
  async applyKycResult(kycRef: string, status: "verified" | "failed"): Promise<{ updated: number }> {
    const res = await this.prisma.rider.updateMany({
      where: { kycRef },
      data: { kycStatus: status, idVerified: status === "verified" },
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
