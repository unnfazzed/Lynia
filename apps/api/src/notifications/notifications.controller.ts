import { Body, Controller, Delete, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { DismissNotificationRequest, RegisterDeviceTokenRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { type NotificationRow, NotificationsFeedService } from "./notifications-feed.service";
import { NotificationsService } from "./notifications.service";

const UnregisterBody = RegisterDeviceTokenRequest.pick({ token: true });

// Guarded: a token is bound to the authenticated profile, never a spoofable header.
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly feedService: NotificationsFeedService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * The caller's in-app notifications feed (customer-journey A·3). Read-only rows derived from their
   * own recent order events — there is no Notification table (push-only, FCM). Newest first.
   *
   * NON-CORE (roadmap 3.1): gated by NOTIFICATIONS_FEED_ENABLED. When the kill switch is off, the feed
   * fails SOFT — an empty list — rather than erroring, so a defect in this ~9-read synthesis can never
   * block the money path. The client already renders an empty feed as the ordinary "nothing yet" state.
   */
  @Get("feed")
  feed(@CurrentUser() profileId: string): Promise<NotificationRow[]> | NotificationRow[] {
    if (this.env.NOTIFICATIONS_FEED_ENABLED === "false") return [];
    return this.feedService.feedForUser(profileId);
  }

  /**
   * STREAMLINE-01: the caller's unread row count, for the Account row's "N new" hint — unread used to be
   * invisible until you were already inside the centre. Same kill switch and same fail-soft posture as
   * the feed it summarises (an off switch reports zero unread, which is what an empty feed means).
   */
  @Get("unread-count")
  async unreadCount(@CurrentUser() profileId: string): Promise<{ count: number }> {
    if (this.env.NOTIFICATIONS_FEED_ENABLED === "false") return { count: 0 };
    return { count: await this.feedService.unreadCountForUser(profileId) };
  }

  /**
   * STREAMLINE-01: stamp the read watermark — the client calls this when the centre gains focus. Not
   * kill-switch-gated: it is a single-column write that must keep working even with the (non-core) feed
   * synthesis switched off, so flipping the switch can never leave a stale "N new" hint behind.
   *
   * Throttled like the other authenticated writes on this controller. A focus event per screen open is
   * a handful per minute at worst; the cap only bounds a client stuck in a focus loop.
   */
  @Throttle({ limit: 30, windowSec: 60, keyPrefix: "notifications-read" })
  @Post("read")
  markRead(@CurrentUser() profileId: string): Promise<{ readAt: string }> {
    return this.feedService.markRead(profileId);
  }

  /**
   * STREAMLINE-01: dismiss one feed row (the swipe). The body carries the feed's own synthetic row id;
   * dismissals are scoped to the authenticated profile, so one user can never dismiss another's row (the
   * id is stored opaquely against `profileId` and only ever filtered against that same profile's feed).
   * Idempotent upsert, so a retry over a flaky link is a no-op rather than an error.
   */
  @Throttle({ limit: 60, windowSec: 60, keyPrefix: "notifications-dismiss" })
  @Post("dismiss")
  dismiss(
    @Body(new ZodBody(DismissNotificationRequest)) body: DismissNotificationRequest,
    @CurrentUser() profileId: string,
  ): Promise<{ ok: true }> {
    return this.feedService.dismiss(profileId, body.id);
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
