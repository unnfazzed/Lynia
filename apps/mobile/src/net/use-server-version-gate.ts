// The VersionGate zod schemas are lazy-required inside fetchServerVersionGate so the contracts
// (~202 KB of schema construction, MOB-BOOT-03-SIB-2) load on the first fetch — behind its 250 ms
// boot-priority timer — not at module evaluation. This module IS on the launch path (imported by
// app/_layout.tsx for the force-update gate). Same lazy-require seam as PostHog in analytics.tsx.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { API_URL } from "../config";
import { BACKGROUND_CHECK_TIMEOUT_MS } from "./network-policy";
import { fetchSignal } from "./fetch-signal";

/** What `GET /app/version-gate?soft=1` answers (First Run v2, ledger D-82 §2 #7). */
export interface ServerVersionGate {
  /** The hard minimum — below it the force-update screen (U1) replaces the app. */
  min: string;
  /** The soft nudge — below it Home / the rider board show the U4 banner once per version. Null = off. */
  recommended: string | null;
  /** U1's optional "New · …" line. Null = no pill. */
  whatsNew: string | null;
}

/**
 * Server-driven force-update minimum (docs/LAUNCH-DEPLOYMENT-STRATEGY.md §1c). The build-time
 * MIN_SUPPORTED_VERSION can only gate builds that ship with it; this fetches the API's
 * `GET /app/version-gate` at cold start so an already-installed binary can be walked to its store
 * when a breaking change strands it — the escape hatch that turns "old app crashes against
 * the new API" into a calm update screen.
 *
 * Since First Run v2 it asks with `soft=1` for the soft-update fields too (`recommendedVersion`,
 * `whatsNew`). That body is opt-in on the server because the plain one is strict on every installed
 * build; an older server ignores the parameter and answers the plain body, which still parses here.
 *
 * FAIL-OPEN by design: any network error, timeout, non-200, or wire-shape mismatch resolves to
 * null (no gate). Blocking the app because the gate endpoint was unreachable would invert the
 * feature into an outage amplifier — the honest failure mode for a *check* is to not block.
 * Plain fetch (not the api client): this runs pre-auth and must stay dependency-free of the
 * session/RUM hooks.
 */
export async function fetchServerVersionGate(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS,
): Promise<ServerVersionGate | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Per platform (docs/APP-STORE-SUBMISSION.md B5): an iPhone has its own minimum, so a bump made for
    // Android never strands an iPhone whose update is still in App Review. Any other value, and a build
    // that sends none, gets the Android/default minimum.
    const res = await fetchImpl(`${API_URL}/app/version-gate?platform=${Platform.OS}&soft=1`, { signal: fetchSignal(controller) });
    if (!res.ok) return null;
    const { VersionGateResponse: plain, VersionGateSoftResponse: soft } = require("@lynia/shared") as typeof import("@lynia/shared");
    const body: unknown = await res.json();
    const s = soft.safeParse(body);
    if (s.success) return { min: s.data.minSupportedVersion, recommended: s.data.recommendedVersion, whatsNew: s.data.whatsNew };
    const p = plain.safeParse(body);
    return p.success ? { min: p.data.minSupportedVersion, recommended: null, whatsNew: null } : null;
  } catch {
    return null; // offline / timeout / bad JSON — fail open
  } finally {
    clearTimeout(timer);
  }
}

/** The minimum alone (the force-update gate's half of {@link fetchServerVersionGate}). */
export async function fetchServerMinVersion(fetchImpl: typeof fetch = fetch, timeoutMs = BACKGROUND_CHECK_TIMEOUT_MS): Promise<string | null> {
  return (await fetchServerVersionGate(fetchImpl, timeoutMs))?.min ?? null;
}

// ── One answer per cold start, shared ──────────────────────────────────────────────────────────────
// The root layout fetches it (useServerMinVersion); Home's and the rider board's soft-update banners
// read the same answer (useServerVersionGate) instead of asking again.
let gate: ServerVersionGate | null = null;
const listeners = new Set<() => void>();

function setGate(next: ServerVersionGate): void {
  gate = next;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getGate = (): ServerVersionGate | null => gate;

/** The last server answer this process got, or null (loading, unreachable, or never asked). */
export function useServerVersionGate(): ServerVersionGate | null {
  return useSyncExternalStore(subscribe, getGate, getGate);
}

/** Test seam. */
export function setServerVersionGateForTest(next: ServerVersionGate | null): void {
  gate = next;
  for (const fn of listeners) fn();
}

/** Cold-boot request prioritization (B-O7): deferred a beat behind mount so this background CHECK
 *  doesn't contend for the first available connection slot with the first-paint-critical
 *  `/app/bootstrap` aggregate (fired the same boot moment for a signed-in user) on a constrained
 *  2G/3G link — see the matching note in `usePushRegistration`. Harmless on a pre-auth boot with no
 *  bootstrap to contend with too: this is already a background check the app never blocks on. */
const BOOT_VERSION_GATE_DELAY_MS = 250;

/** The server minimum, or null while loading / when unavailable (both render as "no gate"). Checked
 *  once per cold start — a mid-session bump takes effect on next launch, which is deliberate: never
 *  yank the navigator out from under an in-flight delivery. Also publishes the soft-update fields to
 *  {@link useServerVersionGate}. */
export function useServerMinVersion(): string | null {
  const [min, setMin] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchServerVersionGate().then((value) => {
        if (cancelled || !value) return;
        setGate(value);
        setMin(value.min);
      });
    }, BOOT_VERSION_GATE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  return min;
}
