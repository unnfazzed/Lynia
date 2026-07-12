import { Body, Controller, Patch, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RiderService } from "./rider.service";

const CompleteProfile = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  idNumber: z.string().min(4).max(40),
});
const BecomeRider = z.object({
  bikeReg: z.string().min(3).max(20),
  // The storage key returned by POST /uploads/kyc-photo (not a URL anymore — read URLs are minted on
  // demand). Kept the column/field name `photoUrl`; the value it carries is now the object key.
  photoUrl: z.string().min(1).max(256),
});
// lat/lng are optional — when the going-online request carries the rider's position we corridor-check it
// (Q1 out-of-area gate); an older client that omits them just skips the check.
const SetOnline = z.object({
  online: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

@Controller("riders")
@UseGuards(JwtAuthGuard)
export class RidersController {
  constructor(private readonly riders: RiderService) {}

  @Patch("profile")
  complete(@Body(new ZodBody(CompleteProfile)) body: z.infer<typeof CompleteProfile>, @CurrentUser() id: string) {
    return this.riders.completeProfile(id, body);
  }

  @Post("become")
  become(@Body(new ZodBody(BecomeRider)) body: z.infer<typeof BecomeRider>, @CurrentUser() id: string) {
    return this.riders.becomeRider(id, body);
  }

  /** Re-run KYC for an existing rider whose check is pending/failed (Didit allows retries). */
  // F-13: cap resubmits — each auto-mode retry mints a fresh PAID vendor session, so an uncapped route
  // is both a cost-abuse and a throttle bypass on top of the A-02 two-attempt lock. 5/hour is generous
  // for a genuine rider re-taking their selfie while blunting a scripted flood.
  @Throttle({ limit: 5, windowSec: 3600, keyPrefix: "kyc-retry" })
  @Post("kyc/retry")
  retryKyc(@CurrentUser() id: string) {
    return this.riders.retryKyc(id);
  }

  @Patch("online")
  online(@Body(new ZodBody(SetOnline)) body: z.infer<typeof SetOnline>, @CurrentUser() id: string) {
    const location = body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng } : undefined;
    return this.riders.setOnline(id, body.online, location);
  }
}
