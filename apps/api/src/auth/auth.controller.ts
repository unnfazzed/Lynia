import { Body, Controller, Get, Headers, Ip, Post, UseGuards } from "@nestjs/common";
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

  @Post("otp/verify")
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
  logout(@Body(new ZodBody(Logout)) body: z.infer<typeof Logout>) {
    return this.auth.logout(body.sessionId);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() profileId: string) {
    return this.auth.getProfile(profileId);
  }
}
