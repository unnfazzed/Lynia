/**
 * Push seam (D7). FCM directly (no cloud-specific notification hub) — the SDK works from any host,
 * so push is portable by construction.
 */
export interface PushMessage {
  token: string;
  /**
   * The device's platform as it registered (`DeviceToken.platform`). `ios` tokens are raw APNs tokens
   * and go to APNs; anything else (including absent, for legacy rows) goes to FCM — PlatformRoutedPush.
   */
  platform?: string | null;
  title: string;
  body: string;
  data?: Record<string, string>;
  /**
   * Optional time-to-live (seconds) for time-critical pushes. When set, the adapter tells the provider
   * to DROP the message rather than deliver it after this many seconds (FCM `android.ttl` / APNs
   * `apns-expiration`) — so a "new delivery nearby" push queued while a rider was offline never lands
   * hours after the auction died. Omitted (undefined) ⇒ the provider's default lifetime (FCM's 4 weeks),
   * i.e. today's behaviour for every non-time-critical kind. Opt-in per kind at the call site.
   */
  ttlSeconds?: number;
  /**
   * Optional collapse/replace key (FCM `android.collapseKey` / APNs `apns-collapse-id`). When set, the
   * provider replaces any still-undelivered notification sharing the same key instead of stacking a
   * second tray entry — so a retried/duplicated send for the same logical event (e.g. the same order+
   * status) can't leave two notifications for one thing on a flaky link. Omitted ⇒ today's behaviour
   * (every send is its own tray entry). Opt-in per kind at the call site.
   */
  collapseKey?: string;
  /**
   * A silent push (Merchant v2 +5 min, ledger D-77): data only — no banner, no sound. The app reads the
   * data (e.g. a new ready time) the next time it handles a message. FCM sends no `notification` block;
   * APNs sends a `background` push with `content-available`. `title`/`body` are ignored.
   */
  silent?: boolean;
  /**
   * Android notification channel the push posts on (FCM `android.notification.channelId`). Omitted ⇒ the
   * app's default channel. Rider job pings and food-offer alarms go on `JOB_ALERTS_CHANNEL` (First Run v2
   * P9/P12, ledger D-82) so a rider's job alarm can be checked and un-muted on its own. A channel the device
   * hasn't created falls back to the default one, so older builds are unaffected. Ignored by APNs.
   */
  channelId?: string;
}

/** The rider job-alert channel the app creates (apps/mobile src/permissions/notifications.ts). */
export const JOB_ALERTS_CHANNEL = "job-alerts";

/** The push kinds that are rider job alerts: the new-parcel ping and the food-offer alarm. */
const JOB_ALERT_KINDS: ReadonlySet<string> = new Set(["broadcast", "food_offer"]);

/** The Android channel for a push, from its `data.kind`: job alerts → `job-alerts`, everything else default. */
export function androidChannelFor(data: Record<string, string> | undefined): string | undefined {
  return data?.kind && JOB_ALERT_KINDS.has(data.kind) ? JOB_ALERTS_CHANNEL : undefined;
}

/** Outcome of a single send, so the caller can prune tokens the provider says are permanently dead. */
export interface PushResult {
  /** Provider accepted the message. */
  ok: boolean;
  /** The token is permanently unregistered/invalid and the caller should delete it. NOT set for
   *  transient failures (network/5xx) — those must be retried/ignored, never pruned. */
  invalidToken: boolean;
}

export interface PushAdapter {
  send(message: PushMessage): Promise<PushResult>;
  /**
   * Batch send (FCM `sendEach`, ≤500 messages/provider call — the adapter chunks beyond that). Returns
   * one PushResult per input message, in input order, so a caller can prune dead tokens positionally.
   * Never throws — a whole-batch transport failure resolves every result to a non-dead `ok:false`.
   */
  sendEach(messages: PushMessage[]): Promise<PushResult[]>;
}

/** Tokens are bearer-ish device credentials — never log them whole. */
export function maskToken(token: string): string {
  return token.length <= 12 ? "…" : `${token.slice(0, 8)}…${token.slice(-4)}`;
}

export const PUSH = Symbol("PUSH_ADAPTER");
