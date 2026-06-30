import { Logger } from "@nestjs/common";
import { maskToken, type PushAdapter, type PushMessage, type PushResult } from "./push.interface";

/**
 * Log-only push. The default when PUSH_PROVIDER != "fcm" — i.e. local dev, tests, and production
 * until the Firebase project + messaging role are provisioned. Keeps the seam exercised (callers
 * can always `send`) without any vendor dependency.
 */
export class NoopPush implements PushAdapter {
  private readonly logger = new Logger(NoopPush.name);

  async send(message: PushMessage): Promise<PushResult> {
    this.logger.debug(`push (noop) → ${maskToken(message.token)}: ${message.title}`);
    return { ok: true, invalidToken: false };
  }

  async sendEach(messages: PushMessage[]): Promise<PushResult[]> {
    return Promise.all(messages.map((m) => this.send(m)));
  }
}
