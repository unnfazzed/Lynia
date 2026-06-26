import { Global, Module } from "@nestjs/common";
import IORedis from "ioredis";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
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
    { provide: OTP_SENDER, inject: [ENV], useFactory: (env: Env) => selectOtpSender(env) },
    {
      provide: OTP_STORE,
      inject: [ENV],
      useFactory: (env: Env): OtpStore =>
        env.REDIS_URL ? new RedisOtpStore(new IORedis(env.REDIS_URL)) : new InMemoryOtpStore(),
    },
  ],
  exports: [TokenService, JwtAuthGuard],
})
export class AuthModule {}
