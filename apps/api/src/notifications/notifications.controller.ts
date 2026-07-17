import { Body, Controller, Delete, Get, Post, UseGuards } from "@nestjs/common";
import { RegisterDeviceTokenRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { NotificationsFeedService } from "./notifications-feed.service";
import { NotificationsService } from "./notifications.service";

const UnregisterBody = RegisterDeviceTokenRequest.pick({ token: true });

// Guarded: a token is bound to the authenticated profile, never a spoofable header.
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly feedService: NotificationsFeedService,
  ) {}

  /**
   * The caller's in-app notifications feed (customer-journey A·3). Read-only rows derived from their
   * own recent order events — there is no Notification table (push-only, FCM). Newest first.
   */
  @Get("feed")
  feed(@CurrentUser() profileId: string) {
    return this.feedService.feedForUser(profileId);
  }

  /** Mobile posts its FCM device token after login (and on token refresh). */
  // DS-08: another authenticated write outside the throttle convention. Idempotent upsert, but the
  // reassign-on-upsert means an uncapped route can be hammered to rewrite token ownership; a modest cap.
  @Throttle({ limit: 20, windowSec: 60, keyPrefix: "device-token" })
  @Post("device-token")
  register(
    @Body(new ZodBody(RegisterDeviceTokenRequest)) body: RegisterDeviceTokenRequest,
    @CurrentUser() profileId: string,
  ) {
    return this.notifications.registerToken(profileId, body.token, body.platform);
  }

  /** Clear a token (sign-out / notifications disabled). */
  @Delete("device-token")
  unregister(@Body(new ZodBody(UnregisterBody)) body: { token: string }, @CurrentUser() profileId: string) {
    return this.notifications.unregisterToken(profileId, body.token);
  }
}
