import { Global, Module } from "@nestjs/common";
import { PiiCryptoService } from "./pii-crypto.service";

/** @Global so any service (riders, auth, admin) can inject PiiCryptoService without a per-module import. */
@Global()
@Module({
  providers: [PiiCryptoService],
  exports: [PiiCryptoService],
})
export class PiiCryptoModule {}
