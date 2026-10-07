// SDK 54 (expo-file-system 19) moved this path-and-promise API to the `/legacy` entry.
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import type { OrderSnapshot } from "../api/orders";
import { webKvGet, webKvRemove, webKvRemoveByPrefix, webKvSet } from "./web-kv";

/**
 * The last full order snapshot per live order, on disk, for the order screen's offline cold start
 * (After Send v2, state 2.4: "Reconnecting… Showing your order as of 09:24."). The bounded SecureStore
 * summary (`last-active-store`) is too small to draw the stage sheet; the full snapshot is a few KB,
 * past SecureStore's ~2 KB advisory, so it lives in an app-private file instead. Written once per
 * status transition, deleted when the order ends, and wiped with the query cache at sign-out.
 * Best-effort throughout — a failed read is just "no saved copy".
 *
 * On the web there is no file system (expo-file-system has no web implementation), so the customer
 * web build keeps the same copies in browser storage (`web-kv.ts`) — otherwise a reload of
 * app.lyniago.com/order/… on a dead link had nothing to draw.
 */
const WEB = Platform.OS === "web";
const WEB_PREFIX = "order-copy:";
const DIR = `${FileSystem.documentDirectory ?? ""}order-copies/`;
const safeId = (orderId: string): string => orderId.replace(/[^a-zA-Z0-9-]/g, "");
const path = (orderId: string): string => `${DIR}${safeId(orderId)}.json`;

export interface OrderCopy {
  /** ISO time the copy was saved. */
  at: string;
  order: OrderSnapshot;
}

function parseCopy(raw: string, orderId: string): OrderCopy | null {
  const v = JSON.parse(raw) as Partial<OrderCopy>;
  if (typeof v.at !== "string" || !v.order || v.order.id !== orderId) return null;
  return { at: v.at, order: v.order };
}

export async function saveOrderCopy(order: OrderSnapshot): Promise<void> {
  if (WEB) {
    webKvSet(WEB_PREFIX + safeId(order.id), JSON.stringify({ at: new Date().toISOString(), order } satisfies OrderCopy));
    return;
  }
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
    await FileSystem.writeAsStringAsync(path(order.id), JSON.stringify({ at: new Date().toISOString(), order } satisfies OrderCopy));
  } catch {
    /* best-effort */
  }
}

export async function loadOrderCopy(orderId: string): Promise<OrderCopy | null> {
  if (WEB) {
    const raw = webKvGet(WEB_PREFIX + safeId(orderId));
    try {
      return raw ? parseCopy(raw, orderId) : null;
    } catch {
      return null;
    }
  }
  if (!FileSystem.documentDirectory) return null;
  try {
    return parseCopy(await FileSystem.readAsStringAsync(path(orderId)), orderId);
  } catch {
    return null;
  }
}

export async function clearOrderCopy(orderId: string): Promise<void> {
  if (WEB) return webKvRemove(WEB_PREFIX + safeId(orderId));
  if (!FileSystem.documentDirectory) return;
  await FileSystem.deleteAsync(path(orderId), { idempotent: true }).catch(() => undefined);
}

/** Sign-out: every saved order copy goes. */
export async function clearAllOrderCopies(): Promise<void> {
  if (WEB) return webKvRemoveByPrefix(WEB_PREFIX);
  if (!FileSystem.documentDirectory) return;
  await FileSystem.deleteAsync(DIR, { idempotent: true }).catch(() => undefined);
}
