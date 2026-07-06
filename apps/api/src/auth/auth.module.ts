import { Global, Module } from "@nestjs/common";
import { createRedisClient } from "../common/redis";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { OTP_SENDER, selectOtpSender } from "./otp-sender";
import { InMemoryOtpStore, OTP_STORE, type OtpStore, RedisOtpStore } from "./otp-store";
import { TokenService } from "./token.service";

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    JwtAuthGuard,
    AdminGuard,
    { provide: OTP_SENDER, inject: [ENV], useFactory: (env: Env) => selectOtpSender(env) },
    {
      provide: OTP_STORE,
      inject: [ENV],
      useFactory: (env: Env): OtpStore =>
        env.REDIS_URL ? new RedisOtpStore(createRedisClient(env.REDIS_URL)) : new InMemoryOtpStore(),
    },
  ],
  // OTP_STORE is exported so the global ThrottleGuard (registered in AppModule) can reuse the same
  // Redis-backed fixed-window counter this module already provides.
  exports: [TokenService, JwtAuthGuard, AdminGuard, OTP_STORE],
})
export class AuthModule {}
