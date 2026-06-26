import { Global, Module } from "@nestjs/common";
import { EnvSecrets } from "./env.secrets";
import { SECRETS } from "./secrets.interface";

@Global()
@Module({
  providers: [{ provide: SECRETS, useFactory: () => new EnvSecrets() }],
  exports: [SECRETS],
})
export class SecretsModule {}
