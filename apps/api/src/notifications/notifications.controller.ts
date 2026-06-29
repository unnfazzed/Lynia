import { Body, Controller, Delete, Post, UseGuards } from "@nestjs/common";
import { RegisterDeviceTokenRequest } from "@lynia/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/current-user.decorator";
import { ZodBody } from "../common/zod.pipe";
import { NotificationsService } from "./notifications.service";

const UnregisterBody = RegisterDeviceTokenRequest.pick({ token: true });

// Guarded: a token is bound to the authenticated profile, never a spoofable header.
@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Mobile posts its FCM device token after login (and on token refresh). */
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
