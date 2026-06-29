import { Logger } from "@nestjs/common";
import type { App } from "firebase-admin/app";
import type { Messaging } from "firebase-admin/messaging";
import type { PushAdapter, PushMessage } from "./push.interface";

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

  async send(message: PushMessage): Promise<void> {
    try {
      const messaging = await this.messaging();
      await messaging.send(buildFcmMessage(message));
      this.logger.debug(`push → ${message.token}: ${message.title}`);
    } catch (err) {
      this.logger.warn(`push send failed for ${message.token}: ${(err as Error).message}`);
    }
  }
}
