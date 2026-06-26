import { Global, Module } from "@nestjs/common";
import { FcmPush } from "./fcm.push";
import { PUSH } from "./push.interface";

@Global()
@Module({
  providers: [{ provide: PUSH, useFactory: () => new FcmPush() }],
  exports: [PUSH],
})
export class PushModule {}
