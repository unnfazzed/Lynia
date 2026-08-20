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
/**
 * `force` = "the credentials you last gave me are dead; do not hand them back".
 *
 * The resume path in retryKyc is free and is the right default, but it has one blind spot: it proves
 * a session EXISTS, never that it is still openable. An expired token therefore resumes forever — the
 * rider taps "Try again", gets the same dead token, and the SDK rejects it again, with no webhook
 * coming to clear the row (expiry is silent). Only the device can see that, so only the device can
 * say it. Optional and defaulted, so an older client is unaffected.
 *
 * Not a cost hole: the route's 5/hour throttle and the A-02 two-attempt lock both sit in front of the
 * mint, and the client sets this ONLY for an expired session — never for a denied camera or a dropped
 * network, which a new session would not fix anyway.
 */
const RetryKyc = z.object({
  force: z.boolean().optional(),
});
// The 20s liveness beat (wave-2 W3): position only, no `online` flag — a beat can never toggle state.
const Heartbeat = z.object({
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

  // DS13-06: throttle parity with kyc/retry below — in auto mode each become mints a fresh PAID Didit
  // session (vendor.submit), so an unthrottled route lets a parallel burst bill N sessions before the
  // one-rider-row unique index catches up. 5/hour is generous for a genuine signup while blunting a flood.
  @Throttle({ limit: 5, windowSec: 3600, keyPrefix: "become" })
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
  retryKyc(@Body(new ZodBody(RetryKyc)) body: z.infer<typeof RetryKyc>, @CurrentUser() id: string) {
    return this.riders.retryKyc(id, { force: body.force === true });
  }

  @Patch("online")
  online(@Body(new ZodBody(SetOnline)) body: z.infer<typeof SetOnline>, @CurrentUser() id: string) {
    const location = body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng } : undefined;
    return this.riders.setOnline(id, body.online, location);
  }

  /** Wave-2 W3: the 20s liveness beat, split off the full online toggle — refreshes heartbeat +
   *  position for an already-online rider in good standing (see rider.service.heartbeat for the
   *  conservative invariants). Old clients keep beating via PATCH /online untouched. */
  @Post("heartbeat")
  heartbeat(@Body(new ZodBody(Heartbeat)) body: z.infer<typeof Heartbeat>, @CurrentUser() id: string) {
    const location = body.lat != null && body.lng != null ? { lat: body.lat, lng: body.lng } : undefined;
    return this.riders.heartbeat(id, location);
  }
}
