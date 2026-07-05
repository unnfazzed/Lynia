import { Module } from "@nestjs/common";
import { SettlementsService } from "./settlements.service";

/**
 * A-06 cash settlement engine. Exports SettlementsService so the admin cash endpoints
 * (AdminController, in the AdminModule) can delegate the settlement reads/writes to it.
 */
@Module({
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
