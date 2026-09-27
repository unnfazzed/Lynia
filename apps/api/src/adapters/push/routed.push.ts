import type { PushAdapter, PushMessage, PushResult } from "./push.interface";

/**
 * Sends each device's push through its platform's transport: `ios` tokens are raw APNs tokens (the iOS
 * app embeds no Firebase SDK) and go to APNs; every other token — `android`, or a legacy row with no
 * platform — goes to FCM. Before this, iOS tokens went to FCM, which rejects them with a code outside
 * its dead-token set, so they were never pruned and failed on every send.
 */
export class PlatformRoutedPush implements PushAdapter {
  constructor(
    readonly fcm: PushAdapter,
    readonly apns: PushAdapter,
  ) {}

  private adapterFor(message: PushMessage): PushAdapter {
    return message.platform === "ios" ? this.apns : this.fcm;
  }

  send(message: PushMessage): Promise<PushResult> {
    return this.adapterFor(message).send(message);
  }

  /** Splits the batch by transport, sends both halves concurrently, and restores input order. */
  async sendEach(messages: PushMessage[]): Promise<PushResult[]> {
    const iosIndexes: number[] = [];
    const otherIndexes: number[] = [];
    messages.forEach((m, i) => (m.platform === "ios" ? iosIndexes : otherIndexes).push(i));
    const pick = (indexes: number[]): PushMessage[] => indexes.map((i) => messages[i] as PushMessage);
    const [iosResults, otherResults] = await Promise.all([
      iosIndexes.length > 0 ? this.apns.sendEach(pick(iosIndexes)) : Promise.resolve([]),
      otherIndexes.length > 0 ? this.fcm.sendEach(pick(otherIndexes)) : Promise.resolve([]),
    ]);
    const missing: PushResult = { ok: false, invalidToken: false };
    const results: PushResult[] = messages.map(() => missing);
    iosIndexes.forEach((index, k) => (results[index] = iosResults[k] ?? missing));
    otherIndexes.forEach((index, k) => (results[index] = otherResults[k] ?? missing));
    return results;
  }
}
