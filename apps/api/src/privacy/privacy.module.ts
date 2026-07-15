import { Module } from "@nestjs/common";
import { TrackingModule } from "../tracking/tracking.module";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";

/** LR8 data-retention + right-to-erasure (docs/DATA-RETENTION.md). TrackingModule is imported so
 *  eraseAccount can evict an erased rider from the Redis geo index (DS15-05); StorageModule is @Global
 *  so the GCS object purge (DS15-03) needs no import wiring. */
@Module({
  imports: [TrackingModule],
  controllers: [PrivacyController],
  providers: [PrivacyService],
})
export class PrivacyModule {}
