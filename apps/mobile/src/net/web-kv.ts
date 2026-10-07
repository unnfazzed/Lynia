/**
 * Browser storage for the customer web build's disk caches. On the web, `expo-file-system` has no
 * implementation: every call rejects and `documentDirectory` is null. So the warm-boot query cache
 * (`query/persist.ts`) never restored and the order screen's offline copy (`order-copy-store.ts`) was
 * never written — a reload on a slow or dead link painted skeletons, or nothing, where the phone app
 * paints last-known data. This is the same best-effort contract over `localStorage`: a read failure is
 * "nothing saved", a write failure (quota, private mode, blocked site data) is a no-op, never a throw.
 *
 * Keys are namespaced so they can't collide with sign-in storage (`metro-shims/secure-store-web.js`)
 * or anything else on the origin, and `removeByPrefix` lets sign-out wipe a whole family at once.
 */
const NS = "lynia.cache:";

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Some browsers throw on the bare property read when site data is blocked.
    return null;
  }
}

export function webKvGet(key: string): string | null {
  try {
    return storage()?.getItem(NS + key) ?? null;
  } catch {
    return null;
  }
}

export function webKvSet(key: string, value: string): void {
  try {
    storage()?.setItem(NS + key, value);
  } catch {
    /* quota or blocked: the cache is an accelerant, the app runs without it */
  }
}

export function webKvRemove(key: string): void {
  try {
    storage()?.removeItem(NS + key);
  } catch {
    /* best-effort */
  }
}

/** Remove every key under `prefix` (sign-out). Keys are collected first: removing while indexing shifts them. */
export function webKvRemoveByPrefix(prefix: string): void {
  const s = storage();
  if (!s) return;
  try {
    const full = NS + prefix;
    const doomed: string[] = [];
    for (let i = 0; i < s.length; i += 1) {
      const k = s.key(i);
      if (k?.startsWith(full)) doomed.push(k);
    }
    for (const k of doomed) s.removeItem(k);
  } catch {
    /* best-effort */
  }
}
