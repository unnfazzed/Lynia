import { Body, Controller, Patch, Post, UseGuards } from "@nestjs/common";
import { UploadObjectKey } from "@lynia/shared";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RiderProfileService, UpdateRiderProfile } from "./rider-profile.service";
import { RiderService } from "./rider.service";

// Trimmed before the length check (parity with PATCH /auth/me): "   " is a blank name, not a 3-char one.
export const CompleteProfile = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  idNumber: z.string().min(4).max(40),
});
const BecomeRider = z.object({
  // Optional since Calm Mint v2 (D-55): a rider needs only the ID check to start; the plate is added
  // later. Absent or blank stores null. An older client that still sends it is unaffected.
  bikeReg: z
    .string()
    .trim()
    .max(20)
    .optional()
    .refine((v) => !v || v.length >= 3, "Bike registration must be at least 3 characters"),
  // The storage key returned by POST /uploads/kyc-photo (not a URL anymore — read URLs are minted on
  // demand). Kept the column/field name `photoUrl`; the value it carries is now the object key.
  // OPTIONAL since 2026-10-02 (owner): the rider photo is no longer a sign-up step — it can be added later.
  photoUrl: UploadObjectKey.optional(),
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
 * Not a cost hole: a forced replacement is claimed once per hour, and the service's paid-mint ceiling and
 * the A-02 two-attempt lock both sit in front of the mint; the client sets this ONLY for an expired session —
 * never for a denied camera or a dropped network, which a new session would not fix anyway.
 */
const RetryKyc = z.object({
  force: z.boolean().optional(),
});
/**
 * Requests per hour per biker on the two routes that can buy a Didit session (become, kyc/retry). A flood
 * guard only — what bounds the spend is in RiderService (claims before every paid call, KYC_PAID_MINT_LIMIT
 * paid sessions an hour, the daily fixable-decline cap, the A-02 lock), which counts only sessions we paid for.
 */
export const KYC_ROUTE_REQUEST_CAP = 30;

// The 20s liveness beat (wave-2 W3): position only, no `online` flag — a beat can never toggle state.
const Heartbeat = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

@Controller("riders")
@UseGuards(JwtAuthGuard)
export class RidersController {
  constructor(
    private readonly riders: RiderService,
    private readonly profile: RiderProfileService,
  ) {}

  /** D-79 (owner 2026-10-06): the rider adds or changes their photo / bike plate from Bike & documents. */
  @Throttle({ limit: 20, windowSec: 3600, keyPrefix: "rider-me" })
  @Patch("me")
  updateMe(@Body(new ZodBody(UpdateRiderProfile)) body: UpdateRiderProfile, @CurrentUser() id: string) {
    return this.profile.updateProfile(id, body);
  }

  @Patch("profile")
  complete(@Body(new ZodBody(CompleteProfile)) body: z.infer<typeof CompleteProfile>, @CurrentUser() id: string) {
    return this.riders.completeProfile(id, body);
  }

  // DS13-06: a request-flood guard, not the spend bound. The spend is bounded in the service: become claims
  // the rider row BEFORE its paid vendor call (KYC-R26-10), so one sign-up mints at most one session however
  // many requests race. The cap used to be 5/hour, and it counted every request — a Didit blip (503s) or a
  // lost-response replay locked an honest biker out of sign-up for an hour. 30/hour still blunts a script.
  @Throttle({ limit: KYC_ROUTE_REQUEST_CAP, windowSec: 3600, keyPrefix: "become" })
  @Post("become")
  become(@Body(new ZodBody(BecomeRider)) body: z.infer<typeof BecomeRider>, @CurrentUser() id: string) {
    return this.riders.becomeRider(id, body);
  }

  /** Re-run KYC for an existing rider whose check is pending/failed (Didit allows retries). */
  // F-13: the PAID retries are capped in the service, where only a session actually bought counts: at most
  // KYC_PAID_MINT_LIMIT (5) paid sessions an hour per biker, the daily cap on fixable declines, the A-02
  // lock, and a claim before every paid call so a double tap buys one session. This route cap is only the
  // request-flood guard. At 5/hour it counted FREE resumes and vendor 503s too, so "Finish verifying" tapped
  // a few times, or a Didit blip, locked an honest biker out of their own check for an hour.
  @Throttle({ limit: KYC_ROUTE_REQUEST_CAP, windowSec: 3600, keyPrefix: "kyc-retry" })
  @Post("kyc/retry")
  retryKyc(@Body(new ZodBody(RetryKyc)) body: z.infer<typeof RetryKyc>, @CurrentUser() id: string) {
    return this.riders.retryKyc(id, { force: body.force === true });
  }

  /**
   * Owner 2026-10-15: the verified biker starts (or reopens) the selfie re-check ops asked for. A session already
   * open comes back for free; a new one is paid and bounded in the service like every other mint.
   */
  @Throttle({ limit: KYC_ROUTE_REQUEST_CAP, windowSec: 3600, keyPrefix: "selfie-recheck" })
  @Post("kyc/selfie-recheck")
  selfieRecheck(@CurrentUser() id: string) {
    return this.riders.startSelfieRecheck(id);
  }

  /**
   * R-4: the app finished an ID-check launch the rider says they completed. Changes nothing; it only
   * drops the cached pending state so the next /auth/me reads the vendor afresh. Cheap, but each call can
   * cost one vendor read, so it is throttled like a generous poll.
   */
  @Throttle({ limit: 20, windowSec: 3600, keyPrefix: "kyc-launched" })
  @Post("kyc/launched")
  kycLaunched(@CurrentUser() id: string) {
    return this.riders.noteKycLaunched(id);
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
