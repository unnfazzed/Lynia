import { Logger } from "@nestjs/common";
import type { PushAdapter, PushMessage } from "./push.interface";

/**
 * FCM-direct push (portable across clouds). Lane A wires the contract and a log-only send;
 * the firebase-admin messaging call lands with the notifications lane.
 */
export class FcmPush implements PushAdapter {
  private readonly logger = new Logger(FcmPush.name);

  async send(message: PushMessage): Promise<void> {
    // TODO(notifications lane): firebase-admin messaging().send({...}).
    this.logger.debug(`push → ${message.token}: ${message.title}`);
  }
}
