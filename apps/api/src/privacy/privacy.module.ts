import { Module } from "@nestjs/common";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

/** LR8 data-retention + right-to-erasure (docs/DATA-RETENTION.md). */
@Module({
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
