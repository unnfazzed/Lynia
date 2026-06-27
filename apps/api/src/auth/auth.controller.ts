import { Body, Controller, Get, Headers, Ip, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

const RequestOtp = z.object({ phone: z.string().min(6).max(20) });
const VerifyOtp = z.object({ phone: z.string().min(6).max(20), code: z.string().length(6) });
const Refresh = z.object({ refreshToken: z.string().min(10) });
const Logout = z.object({ sessionId: z.string().uuid() });

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

  @Post("refresh")
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
