import { Body, Controller, Headers, Inject, Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AdminGuard } from "../auth/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ZodBody } from "../common/zod.pipe";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { RiderService } from "../riders/rider.service";

const KycCallback = z.object({ kycRef: z.string().min(1), status: z.enum(["verified", "failed"]) });
const AdminKyc = z.object({ status: z.enum(["pending", "verified", "failed"]) });

@Controller()
export class KycController {
  constructor(
    private readonly riders: RiderService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** KYC vendor webhook. If a callback secret is configured, the header must match. */
  @Post("kyc/callback")
  callback(
    @Body(new ZodBody(KycCallback)) body: z.infer<typeof KycCallback>,
    @Headers("x-kyc-secret") secret?: string,
  ) {
    if (this.env.KYC_CALLBACK_SECRET && secret !== this.env.KYC_CALLBACK_SECRET) {
      throw new UnauthorizedException("Invalid KYC callback signature");
    }
    return this.riders.applyKycResult(body.kycRef, body.status);
  }

  /** Manual-review backstop (T7): admin sets a rider's KYC status directly. */
  @Post("admin/riders/:profileId/kyc")
  @UseGuards(JwtAuthGuard, AdminGuard)
  adminSet(
    @Param("profileId", ParseUUIDPipe) profileId: string,
    @Body(new ZodBody(AdminKyc)) body: z.infer<typeof AdminKyc>,
  ) {
    return this.riders.adminSetKyc(profileId, body.status);
  }
}
