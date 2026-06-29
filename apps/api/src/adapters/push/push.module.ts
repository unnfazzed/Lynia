import { Global, Module } from "@nestjs/common";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env";
import { FcmPush } from "./fcm.push";
import { NoopPush } from "./noop.push";
import { PUSH, type PushAdapter } from "./push.interface";

/** FCM when armed (PUSH_PROVIDER=fcm), else a log-only noop (dev/test/unprovisioned). Same seam (D7). */
export function selectPush(env: Env): PushAdapter {
  return env.PUSH_PROVIDER === "fcm" ? new FcmPush(env.FCM_PROJECT_ID) : new NoopPush();
}

@Global()
@Module({
  providers: [
    {
      provide: PUSH,
      inject: [ENV],
      useFactory: (env: Env): PushAdapter => selectPush(env),
    },
  ],
  exports: [PUSH],
})
export class PushModule {}
