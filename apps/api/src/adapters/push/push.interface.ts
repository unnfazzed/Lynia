/**
 * Push seam (D7). FCM directly (not Azure Notification Hubs) — the same SDK works on both clouds,
 * so push is portable by construction.
 */
export interface PushMessage {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
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
