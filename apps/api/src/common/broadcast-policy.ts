import { BROADCAST, broadcastRadiusAtMs } from "@lynia/shared";

/**
 * Deploy-time resolution of the shared BROADCAST policy (same idiom as SOS_POLICY.safetyLineEnv:
 * constant default + env override read at the use site, so no service constructor grows an ENV
 * injection just for a tunable). envSchema validates both vars at boot, so a malformed override
 * fails loud there; the lenient re-parse here only has to cope with values boot already accepted.
 */

function envPositiveInt(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

/** The t=0 broadcast radius (metres) — env-overridable, never past the service corridor. */
export function baseBroadcastRadiusM(): number {
  return Math.min(envPositiveInt(BROADCAST.baseRadiusEnv) ?? BROADCAST.baseRadiusM, BROADCAST.maxRadiusM);
}

/** Ghost cutoff: max heartbeat age (ms) for a rider to count as reachable — env-overridable. Strict
 *  (~120 s): used for the customer-facing "riders nearby" count and the offer-selection gate. */
export function heartbeatMaxAgeMs(): number {
  return envPositiveInt(BROADCAST.heartbeatMaxAgeEnv) ?? BROADCAST.heartbeatMaxAgeMs;
}

/** Permissive heartbeat cutoff (ms) for the FCM BROADCAST audience specifically — env-overridable.
 *  Much looser than {@link heartbeatMaxAgeMs} so a backgrounded-but-online rider (whose foreground JS
 *  heartbeat stopped beating ~120 s after backgrounding) still receives the FCM push that can wake the
 *  app. See BROADCAST.heartbeatMaxAgeMsForPush. */
export function heartbeatMaxAgeMsForPush(): number {
  return envPositiveInt(BROADCAST.heartbeatMaxAgeForPushEnv) ?? BROADCAST.heartbeatMaxAgeMsForPush;
}

/** The broadcast radius an order of this age has widened to (see policy BROADCAST.expansion). */
export function effectiveBroadcastRadiusM(createdAt: Date, now: number = Date.now()): number {
  return broadcastRadiusAtMs(now - createdAt.getTime(), baseBroadcastRadiusM());
}

/** The widest radius the schedule can ever reach — the disc the board query must not under-scan. */
export function maxBroadcastRadiusM(): number {
  return broadcastRadiusAtMs(Number.POSITIVE_INFINITY, baseBroadcastRadiusM());
}
