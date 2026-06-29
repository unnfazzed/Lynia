import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

/**
 * Push notifications + device-token registration. Global (like PushModule) so the offer-loop and
 * lifecycle services can inject NotificationsService without import wiring. Depends on the global
 * PUSH adapter (D7) and PrismaService.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
