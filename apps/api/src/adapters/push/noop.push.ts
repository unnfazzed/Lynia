import { Logger } from "@nestjs/common";
import type { PushAdapter, PushMessage } from "./push.interface";

/**
 * Log-only push. The default when PUSH_PROVIDER != "fcm" — i.e. local dev, tests, and production
 * until the Firebase project + messaging role are provisioned. Keeps the seam exercised (callers
 * can always `send`) without any vendor dependency.
 */
export class NoopPush implements PushAdapter {
  private readonly logger = new Logger(NoopPush.name);

  async send(message: PushMessage): Promise<void> {
    this.logger.debug(`push (noop) → ${message.token}: ${message.title}`);
  }
}
