import { Global, Module } from "@nestjs/common";
import { type Env, loadEnv } from "./env";

/** Injection token for the validated environment. */
export const ENV = Symbol("ENV");

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
