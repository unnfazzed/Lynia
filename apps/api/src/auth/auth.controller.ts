import { Body, Controller, Get, Headers, Ip, Patch, Post, UseGuards } from "@nestjs/common";
import { UpdateProfileRequest } from "@lynia/shared";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

// `.strict()` rejects unknown keys outright (defense in depth on the unauthenticated auth surface),
// rather than zod's default of silently stripping them.
const RequestOtp = z.object({ phone: z.string().min(6).max(20) }).strict();
const VerifyOtp = z.object({ phone: z.string().min(6).max(20), code: z.string().length(6) }).strict();
const Refresh = z.object({ refreshToken: z.string().min(10) }).strict();
const Logout = z.object({ sessionId: z.string().uuid() }).strict();

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
  // an endpoint with no rate limit at all. Cap per IP, tighter than refresh's 30/5min since this
  // guards a shorter (6-digit) secret. A real user needs only a few tries per code (and the live
  // 5-attempt cap already bounds one code), so 10/5min leaves ample headroom for a mistype or a
  // resend-and-retry while blunting brute-force / grace-window probing.
  @Post("otp/verify")
  @Throttle({ limit: 10, windowSec: 300, keyPrefix: "otp-verify" })
  verify(@Body(new ZodBody(VerifyOtp)) body: z.infer<typeof VerifyOtp>, @Headers("user-agent") ua?: string) {
    return this.auth.verifyOtp(body.phone, body.code, ua);
  }

  // Unauthenticated + a bearer of secrets — rate-limit per IP so the refresh-token space can't be
  // brute-forced/replayed at unbounded rate (the only other gate is the timing-safe hash compare).
  @Post("refresh")
  @Throttle({ limit: 30, windowSec: 300, keyPrefix: "refresh" })
  refresh(@Body(new ZodBody(Refresh)) body: z.infer<typeof Refresh>, @Headers("user-agent") ua?: string) {
    return this.auth.refresh(body.refreshToken, ua);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  logout(@Body(new ZodBody(Logout)) body: z.infer<typeof Logout>, @CurrentUser() profileId: string) {
    return this.auth.logout(body.sessionId, profileId);
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
