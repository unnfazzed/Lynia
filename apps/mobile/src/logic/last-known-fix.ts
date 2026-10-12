/**
 * Whether the phone's cached ("last known") position is good enough to start a rider's shift with while
 * a fresh GPS fix is still coming (rider board "Go online", which used to wait up to 9 s for the fresh fix
 * before it would even try). The same two-minute window the customer home and the pickup auto-locate use
 * for a last-known position (src/logic/home-location.ts, src/logic/use-pickup-autolocate.ts), plus an
 * accuracy bound — a cell-tower fix kilometres off would match the rider to the wrong neighbourhood. The
 * fresh fix still refines it the moment it lands.
 */
export const LAST_KNOWN_MAX_AGE_MS = 120_000;
export const LAST_KNOWN_MAX_ACCURACY_M = 200;

export interface CachedFix {
  timestamp: number;
  coords: { latitude: number; longitude: number; accuracy?: number | null };
}

export function isRecentFix(fix: CachedFix | null | undefined, now: number): boolean {
  if (!fix || !Number.isFinite(fix.timestamp)) return false;
  const age = now - fix.timestamp;
  // A small negative age is the location provider's clock a moment ahead of ours — still recent.
  if (age < -60_000 || age > LAST_KNOWN_MAX_AGE_MS) return false;
  const acc = fix.coords.accuracy;
  // An unknown accuracy is trusted (some devices omit it); a known poor one is not.
  return acc == null || acc <= LAST_KNOWN_MAX_ACCURACY_M;
}
