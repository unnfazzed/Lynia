import { Body, Controller, Get, Headers, Ip, Patch, Post, UseGuards } from "@nestjs/common";
import { normalizePhone, RegisterDeviceTokenRequest, UpdateProfileRequest } from "@lynia/shared";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator";
import { byIp, Throttle, type ThrottleRequest } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

// `.strict()` rejects unknown keys outright (defense in depth on the unauthenticated auth surface),
// rather than zod's default of silently stripping them.
const RequestOtp = z.object({ phone: z.string().min(6).max(20) }).strict();
const VerifyOtp = z.object({ phone: z.string().min(6).max(20), code: z.string().length(6) }).strict();
const Refresh = z.object({ refreshToken: z.string().min(10) }).strict();
// `pushToken` (optional — older apps omit it): this device's push token, unbound with the session.
const Logout = z
  .object({ sessionId: z.string().uuid(), pushToken: RegisterDeviceTokenRequest.shape.token.optional() })
  .strict();

/** Throttle keys read from the raw body (the guard runs before the pipes): the phone a code is checked
 *  for, E.164-normalized like AuthService does, and the session a refresh token belongs to. */
const field = (req: ThrottleRequest, name: string): string | undefined => {
  const v = (req.body as Record<string, unknown> | undefined)?.[name];
  return typeof v === "string" ? v : undefined;
};
const byPhone = (req: ThrottleRequest): string | undefined => normalizePhone(field(req, "phone") ?? "") ?? undefined;
const bySession = (req: ThrottleRequest): string | undefined => {
  const token = field(req, "refreshToken");
  const dot = token?.indexOf(".") ?? -1;
  return token && dot > 0 && dot <= 64 ? token.slice(0, dot) : undefined;
};

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request")
  request(@Body(new ZodBody(RequestOtp)) body: z.infer<typeof RequestOtp>, @Ip() ip: string) {
    return this.auth.requestOtp(body.phone, ip);
  }

  // Unauthenticated + a code-guess surface: the live OTP record is capped at 5 attempts, but a
  // successful verify leaves a 60s grace record that re-recognizes the correct code, and that path
  // deliberately carries no attempt counter — so without a route cap the code is guessable through
  // an endpoint with no rate limit at all. Cap per PHONE: guessing is against one number's code, and
  // a real user needs only a few tries per code (the live 5-attempt cap already bounds one code), so
  // 10/5min leaves ample headroom for a mistype or a resend-and-retry while blunting brute-force /
  // grace-window probing from any number of IPs. The per-IP ceiling is 10x looser: riders signing up
  // together behind one carrier NAT share an IP, and must not share one budget (E2E 2026-10-05 FS-1).
  @Post("otp/verify")
  @Throttle(
    { limit: 10, windowSec: 300, keyPrefix: "otp-verify", key: byPhone },
    { limit: 100, windowSec: 300, keyPrefix: "otp-verify-ip", key: byIp },
  )
  verify(
    @Body(new ZodBody(VerifyOtp)) body: z.infer<typeof VerifyOtp>,
    @Headers("user-agent") ua?: string,
    // KB-IDENTITY-BINDING L1: the client's stable per-install device id (soft signal). Optional — older
    // clients send none, in which case the device throttle / recycle-signal are simply not engaged.
    @Headers("x-device-id") deviceId?: string,
  ) {
    return this.auth.verifyOtp(body.phone, body.code, ua, deviceId);
  }

  // Unauthenticated + a bearer of secrets — rate-limit per session so one refresh token can't be
  // brute-forced/replayed at unbounded rate (the only other gate is the timing-safe hash compare), and
  // per IP 10x looser so a carrier NAT's many users don't share one budget (E2E 2026-10-05 FS-1).
  @Post("refresh")
  @Throttle(
    { limit: 30, windowSec: 300, keyPrefix: "refresh", key: bySession },
    { limit: 300, windowSec: 300, keyPrefix: "refresh-ip", key: byIp },
  )
  refresh(@Body(new ZodBody(Refresh)) body: z.infer<typeof Refresh>, @Headers("user-agent") ua?: string) {
    return this.auth.refresh(body.refreshToken, ua);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  logout(@Body(new ZodBody(Logout)) body: z.infer<typeof Logout>, @CurrentUser() profileId: string) {
    return this.auth.logout(body.sessionId, profileId, body.pushToken);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() profileId: string) {
    return this.auth.getProfile(profileId);
  }

  // Post-OTP profile setup: a freshly-verified account has an empty name (verifyOtp seeds firstName "")
  // and gets routed to "Tell us who you are". This is the only way it sets that name — scoped to the
  // caller's own profile (JwtAuthGuard + @CurrentUser), and it can touch nothing but firstName/lastName.
  @Patch("me")
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @Body(new ZodBody(UpdateProfileRequest)) body: UpdateProfileRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.auth.updateProfile(profileId, body);
  }
}
