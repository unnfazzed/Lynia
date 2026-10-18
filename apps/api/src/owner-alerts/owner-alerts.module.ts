import { Global, Module } from "@nestjs/common";
import { OwnerAlertsService } from "./owner-alerts.service";

/** The owner's phone alerts (Telegram). Global, like NotificationsModule, so the auth, rider and order
 *  services inject it without import wiring. */
@Global()
@Module({
  providers: [OwnerAlertsService],
  exports: [OwnerAlertsService],
})
export class OwnerAlertsModule {}
