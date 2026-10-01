// SDK 54 (expo-file-system 19) moved this path-and-promise API to the `/legacy` entry.
import * as FileSystem from "expo-file-system/legacy";
import type { OrderSnapshot } from "../api/orders";

/**
 * The last full order snapshot per live order, on disk, for the order screen's offline cold start
 * (After Send v2, state 2.4: "Reconnecting… Showing your order as of 09:24."). The bounded SecureStore
 * summary (`last-active-store`) is too small to draw the stage sheet; the full snapshot is a few KB,
 * past SecureStore's ~2 KB advisory, so it lives in an app-private file instead. Written once per
 * status transition, deleted when the order ends, and wiped with the query cache at sign-out.
 * Best-effort throughout — a failed read is just "no saved copy".
 */
const DIR = `${FileSystem.documentDirectory ?? ""}order-copies/`;
const path = (orderId: string): string => `${DIR}${orderId.replace(/[^a-zA-Z0-9-]/g, "")}.json`;

export interface OrderCopy {
  /** ISO time the copy was saved. */
  at: string;
  order: OrderSnapshot;
}

export async function saveOrderCopy(order: OrderSnapshot): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
    await FileSystem.writeAsStringAsync(path(order.id), JSON.stringify({ at: new Date().toISOString(), order } satisfies OrderCopy));
  } catch {
    /* best-effort */
  }
}

export async function loadOrderCopy(orderId: string): Promise<OrderCopy | null> {
  if (!FileSystem.documentDirectory) return null;
  try {
    const raw = await FileSystem.readAsStringAsync(path(orderId));
    const v = JSON.parse(raw) as Partial<OrderCopy>;
    if (typeof v.at !== "string" || !v.order || v.order.id !== orderId) return null;
    return { at: v.at, order: v.order };
  } catch {
    return null;
  }
}

export async function clearOrderCopy(orderId: string): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  await FileSystem.deleteAsync(path(orderId), { idempotent: true }).catch(() => undefined);
}

/** Sign-out: every saved order copy goes. */
export async function clearAllOrderCopies(): Promise<void> {
  if (!FileSystem.documentDirectory) return;
  await FileSystem.deleteAsync(DIR, { idempotent: true }).catch(() => undefined);
}
