import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsFeedService } from "./notifications-feed.service";
import { NotificationsService } from "./notifications.service";

/**
 * Push notifications + device-token registration. Global (like PushModule) so the offer-loop and
 * lifecycle services can inject NotificationsService without import wiring. Depends on the global
 * PUSH adapter (D7) and PrismaService. NotificationsFeedService is the read-only in-app feed model,
 * split out since it depends only on PrismaService, not the push adapter.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsFeedService],
  exports: [NotificationsService, NotificationsFeedService],
})
export class NotificationsModule {}
