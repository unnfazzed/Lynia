import { Module } from "@nestjs/common";
import { SettlementsService } from "./settlements.service";

/**
 * Prepaid per-ride commission. Exports SettlementsService so the admin commission endpoint
 * (AdminController, in the AdminModule) can delegate the read-only overview to it. (Replaces the old
 * A-06 weekly cash-settlement engine.)
 */
@Module({
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
