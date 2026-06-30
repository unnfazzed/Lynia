import { Logger } from "@nestjs/common";
import type { App } from "firebase-admin/app";
import type { Messaging } from "firebase-admin/messaging";
import { maskToken, type PushAdapter, type PushMessage, type PushResult } from "./push.interface";

/** FCM error codes that mean the token is permanently dead and should be pruned (vs. a transient
 *  network/5xx failure, which must not prune). */
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

/** FCM `sendEach` accepts at most 500 messages per call; larger fan-outs are chunked to this size. */
const FCM_BATCH_LIMIT = 500;

/** The FCM HTTP-v1 message shape we send. Kept narrow — only what PushMessage maps to. */
export interface FcmMessage {
  token: string;
  notification: { title: string; body: string };
  data?: Record<string, string>;
}

/**
 * Pure mapper: transport-neutral PushMessage → FCM message. Extracted so the payload contract is
 * unit-tested with no firebase-admin / network / credentials in play (live send needs a project).
 */
export function buildFcmMessage(message: PushMessage): FcmMessage {
  const built: FcmMessage = {
    token: message.token,
    notification: { title: message.title, body: message.body },
  };
  // FCM rejects an empty/undefined data map; include it only when there's something to send.
  if (message.data && Object.keys(message.data).length > 0) {
    built.data = message.data;
  }
  return built;
}

/**
 * FCM-direct push (portable across clouds — the same SDK works on Azure or GCP, D7).
 *
 * firebase-admin is loaded lazily on the first send so the dependency never loads on the noop path
 * (dev/test) or at boot. Credentials come from Application Default Credentials — on Cloud Run that's
 * the attached runtime SA, so no private key lives in env. Sends are best-effort (ET4): a delivery
 * failure is logged, never thrown, so it can't fail a committed lifecycle transition.
 */
export class FcmPush implements PushAdapter {
  private readonly logger = new Logger(FcmPush.name);
  private messagingPromise?: Promise<Messaging>;

  constructor(private readonly projectId?: string) {}

  private async messaging(): Promise<Messaging> {
    if (!this.messagingPromise) {
      this.messagingPromise = (async () => {
        // firebase-admin v14 is modular — import the sub-paths lazily so nothing loads on the noop path.
        const { getApps, getApp, initializeApp, applicationDefault } = await import("firebase-admin/app");
        const { getMessaging } = await import("firebase-admin/messaging");
        // Reuse the default app if something already initialized it, else create from ADC.
        const app: App = getApps().length
          ? getApp()
          : initializeApp({ credential: applicationDefault(), projectId: this.projectId });
        return getMessaging(app);
      })();
    }
    return this.messagingPromise;
  }

  async send(message: PushMessage): Promise<PushResult> {
    try {
      const messaging = await this.messaging();
      await messaging.send(buildFcmMessage(message));
      this.logger.debug(`push → ${maskToken(message.token)}: ${message.title}`);
      return { ok: true, invalidToken: false };
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      const invalidToken = DEAD_TOKEN_CODES.has(code);
      this.logger.warn(`push send failed for ${maskToken(message.token)} (${code || "unknown"})`);
      return { ok: false, invalidToken };
    }
  }

  /**
   * Batch send via FCM `sendEach` — one HTTP/2 multiplexed call per ≤500 messages instead of one
   * network round-trip per device (the old `Promise.all(tokens.map(send))` fan-out). Per-message
   * results are mapped back to PushResult in input order, so the caller prunes dead tokens positionally.
   */
  async sendEach(messages: PushMessage[]): Promise<PushResult[]> {
    if (messages.length === 0) return [];
    try {
      const messaging = await this.messaging();
      const results: PushResult[] = [];
      // FCM caps a sendEach batch at 500 messages; chunk anything larger.
      for (let i = 0; i < messages.length; i += FCM_BATCH_LIMIT) {
        const batch = messages.slice(i, i + FCM_BATCH_LIMIT);
        const resp = await messaging.sendEach(batch.map(buildFcmMessage));
        for (const r of resp.responses) {
          if (r.success) {
            results.push({ ok: true, invalidToken: false });
          } else {
            const code = (r.error as { code?: string } | undefined)?.code ?? "";
            results.push({ ok: false, invalidToken: DEAD_TOKEN_CODES.has(code) });
          }
        }
        this.logger.debug(`push batch → ${batch.length} device(s): ${resp.successCount} ok, ${resp.failureCount} failed`);
      }
      return results;
    } catch (err) {
      // A whole-batch throw is a transport/credential failure (transient) — never prune on it.
      const code = (err as { code?: string }).code ?? "";
      this.logger.warn(`push sendEach failed for ${messages.length} device(s) (${code || "unknown"})`);
      return messages.map(() => ({ ok: false, invalidToken: false }));
    }
  }
}
