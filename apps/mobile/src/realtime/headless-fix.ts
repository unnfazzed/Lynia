import * as SecureStore from "expo-secure-store";
import { ApiError, configureApi, currentAccessToken } from "../api/client";
import { postRiderFix } from "../api/orders";
import { loadSession, saveSession, type Session } from "../auth/session";

/**
 * JQ-R2-01: the background location task's fallback when the OS killed the app mid-job.
 *
 * The Android foreground service outlives the JS runtime; the task then wakes in a fresh, headless
 * runtime with no React tree, no socket and no forwarder (see background-location-task.ts), and used to
 * drop every fix — the customer's map froze until the biker reopened the app. Now it posts the fix over
 * REST (`POST /orders/:id/location`, the socket event's sibling) for the job the stream was opened for.
 *
 * Privacy: the job id is written when the active-job stream opens and deleted in the same cleanup that
 * stops it. A job that ended while the app was dead is caught by the server (not the assigned rider of
 * an active order → 403), which clears the id and stops the service — streaming never outlives the job.
 */
const ACTIVE_JOB_KEY = "lynia.bgLocationJob";

export async function rememberActiveJob(orderId: string | null): Promise<void> {
  try {
    if (orderId) await SecureStore.setItemAsync(ACTIVE_JOB_KEY, orderId);
    else await SecureStore.deleteItemAsync(ACTIVE_JOB_KEY);
  } catch {
    /* best-effort: worst case is today's drop-on-the-floor behaviour */
  }
}

async function activeJob(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACTIVE_JOB_KEY);
  } catch {
    return null;
  }
}

/** A headless runtime has no AuthProvider, so the API client has no session — read the stored one. */
async function ensureSession(): Promise<boolean> {
  if (currentAccessToken()) return true;
  let held: Session | null = await loadSession();
  if (!held) return false;
  configureApi({
    getSession: () => held,
    onTokens: async (s) => {
      held = s;
      await saveSession(s);
    },
    onSignOut: () => {
      held = null;
    },
  });
  return currentAccessToken() != null;
}

export type HeadlessOutcome = "sent" | "dropped" | "stopped";

export async function sendHeadlessFix(fix: { lat: number; lng: number }, stop: () => Promise<void>): Promise<HeadlessOutcome> {
  const orderId = await activeJob();
  if (!orderId || !(await ensureSession())) {
    // No job on record, or nobody signed in: nothing may be streamed, so the service has no reason to run.
    await stop();
    return "stopped";
  }
  try {
    await postRiderFix(orderId, fix);
    return "sent";
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 404)) {
      // The job is over (or no longer this biker's): forget it and stop the service.
      await rememberActiveJob(null);
      await stop();
      return "stopped";
    }
    // A dropped link or a 5xx: this fix is lost, the next one (~10 s) tries again.
    return "dropped";
  }
}
