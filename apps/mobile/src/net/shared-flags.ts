import * as SecureStore from "expo-secure-store";
import { useEffect, useSyncExternalStore } from "react";

/**
 * One shared, cached answer per flag set (P17 / U09) — the pattern `useServerVersionGate` already uses
 * ("one answer per cold start, shared"), plus the last known answer kept on disk.
 *
 * Before this, `useOrderFlags` / `useServiceFlags` / `useFeatureFlags` each held the answer in a
 * component's `useState(DEFAULT)` and fetched on every mount, so EVERY screen started from the default
 * and re-asked. For the fail-closed Rx flag that meant each pharmacy screen first rendered "Rx off" (no
 * "Prescription needed" pill, the OTC notice, a cart line added in that window stamped without
 * `rxRequired`) and only flipped after one round trip — the root of U09.
 *
 * Now:
 * - every mount reads the same module value, so navigating storefront → Review reuses the answer fetched
 *   seconds earlier, from the first frame;
 * - a fetch runs at most once per `maxAgeMs` across all mounts, with one request in flight at a time;
 * - a FAILED fetch (offline, timeout, non-200, shape mismatch) never overwrites a known answer — it only
 *   leaves a true cold start on the default, so each flag's fail-open / fail-closed rule is unchanged;
 * - the last good answer is persisted and restored on the next cold start, so an offline relaunch keeps
 *   the last known switches instead of flipping to the default.
 */
export interface SharedFlags<T> {
  /** The current value: the last answer (this process or restored from disk), else the default. */
  useValue: () => T;
  /** Same value, outside React. */
  get: () => T;
  /** Ask the server now (deduped with an in-flight request). Resolves with the current value. */
  refresh: () => Promise<T>;
  /** Test seam: forget everything (value, freshness, in-flight request, disk restore). */
  resetForTest: () => void;
}

export interface SharedFlagsOptions<T> {
  /** SecureStore key for the last good answer (also works on web through the secure-store shim). */
  storageKey: string;
  defaults: T;
  /** The server answer, or null when there is none (failure of any kind). */
  fetch: () => Promise<T | null>;
  /** Deferred behind mount (B-O7 boot request prioritisation); 0 = fetch on mount. */
  delayMs: number;
  /** Don't re-ask within this window (the endpoints' own max-age). */
  maxAgeMs: number;
  /** Validates a restored disk value (a stale schema is ignored, never trusted). */
  isValid: (v: unknown) => v is T;
}

export function createSharedFlags<T>(opts: SharedFlagsOptions<T>): SharedFlags<T> {
  let value: T | null = null;
  let fetchedAt = -Infinity;
  let inflight: Promise<T> | null = null;
  let restoring: Promise<void> | null = null;
  let generation = 0;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const l of listeners) l();
  };
  const get = (): T => value ?? opts.defaults;
  const subscribe = (l: () => void): (() => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  };

  const restore = (): void => {
    if (restoring) return;
    const gen = generation;
    restoring = (async () => {
      try {
        const raw = await SecureStore.getItemAsync(opts.storageKey);
        if (gen !== generation || value !== null || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (!opts.isValid(parsed)) return;
        value = parsed;
        emit();
      } catch {
        /* nothing restorable — the default stands until the server answers */
      }
    })();
  };

  const persist = (answer: T): void => {
    try {
      void Promise.resolve(SecureStore.setItemAsync(opts.storageKey, JSON.stringify(answer))).catch(() => undefined);
    } catch {
      /* best-effort: the in-memory answer still serves this process */
    }
  };

  const refresh = (): Promise<T> => {
    if (inflight) return inflight;
    const gen = generation;
    inflight = opts
      .fetch()
      .catch(() => null)
      .then((answer) => {
        if (gen !== generation) return get();
        inflight = null;
        if (answer === null) return get(); // a failure keeps the last known answer
        fetchedAt = Date.now();
        value = answer;
        emit();
        persist(answer);
        return answer;
      });
    return inflight;
  };

  const useValue = (): T => {
    const current = useSyncExternalStore(subscribe, get, get);
    useEffect(() => {
      restore();
      if (inflight || Date.now() - fetchedAt < opts.maxAgeMs) return;
      if (opts.delayMs <= 0) {
        void refresh();
        return;
      }
      const timer = setTimeout(() => {
        if (!inflight && Date.now() - fetchedAt >= opts.maxAgeMs) void refresh();
      }, opts.delayMs);
      return () => clearTimeout(timer);
    }, []);
    return current;
  };

  const resetForTest = (): void => {
    generation += 1;
    value = null;
    fetchedAt = -Infinity;
    inflight = null;
    restoring = null;
    emit();
  };

  return { useValue, get, refresh, resetForTest };
}

/** True when `v` is an object whose `keys` are all booleans (the shape of every flag body). */
export function isBooleanRecord<K extends string>(v: unknown, keys: readonly K[]): v is Record<K, boolean> {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return keys.every((k) => typeof o[k] === "boolean");
}
