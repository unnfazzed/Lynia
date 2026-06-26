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

export interface PushAdapter {
  send(message: PushMessage): Promise<void>;
}

export const PUSH = Symbol("PUSH_ADAPTER");
