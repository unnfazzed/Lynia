import { Logger } from "@nestjs/common";
import type { Env } from "../config/env";
import { mapDiditPendingState } from "./didit";
import type { ServerKycPendingState } from "./kyc-pending-state";
import type { KycSubmission, KycVendor } from "./kyc-vendor";

/**
 * Didit KYC (verifies Zimbabwean national IDs). Creates a verification session; the rider opens
 * the returned URL, and Didit posts an HMAC-signed status webhook to our /kyc/callback.
 * Field/header names follow Didit's v3 API; the response is read defensively to tolerate aliases.
 */
/** Ceiling on the outbound Didit session-create call. Without it a hung Didit endpoint stalls the
 *  rider's "start verification" request with no bound (worse than the mobile client's 15s abort,
 *  because the server connection stays open and piles up under retries). */
const DIDIT_SESSION_TIMEOUT_MS = 10_000;

/** Tighter ceiling for the decision read: it sits on the rider's own `/auth/me`, so a slow vendor must
 *  degrade to the `unfinished` default fast rather than hold a screen that polls every 5s. */
const DIDIT_DECISION_TIMEOUT_MS = 3_000;

/** KYC-R26-03 / -05: the background reconciler and erasure are not on a rider's screen, so they can wait a
 *  little longer than the `/auth/me` read — still bounded, so a hung vendor can't stall a sweep or an erase. */
const DIDIT_BACKGROUND_TIMEOUT_MS = 8_000;


export class DiditKycVendor implements KycVendor {
  private readonly logger = new Logger(DiditKycVendor.name);

  constructor(private readonly env: Env) {}

  async submit(riderId: string): Promise<KycSubmission> {
    const apiKey = this.env.DIDIT_API_KEY;
    const workflowId = this.env.DIDIT_WORKFLOW_ID;
    if (!apiKey || !workflowId) {
      throw new Error("Didit not configured (DIDIT_API_KEY / DIDIT_WORKFLOW_ID)");
    }

    let res: Response;
    try {
      res = await fetch(`${this.env.DIDIT_BASE_URL}/v3/session/`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          workflow_id: workflowId,
          vendor_data: riderId,
          ...(this.env.DIDIT_CALLBACK_URL ? { callback: this.env.DIDIT_CALLBACK_URL } : {}),
        }),
        signal: AbortSignal.timeout(DIDIT_SESSION_TIMEOUT_MS),
      });
    } catch (err) {
      // A timeout (or any network failure) surfaces as a clean vendor error rather than a hung request.
      this.logger.error(`Didit session create network error: ${err instanceof Error ? err.message : String(err)}`);
      throw new Error("Couldn't reach the ID-check provider", { cause: err });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Didit session create failed: ${res.status} ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      session_id?: string;
      id?: string;
      url?: string;
      verification_url?: string;
      session_token?: string;
    };
    const ref = data.session_id ?? data.id;
    if (!ref) throw new Error("Didit response missing session id");
    // `session_token` is captured HERE or never: Didit returns it only from session-create. The
    // decision endpoint (GET /v3/session/{id}/decision/) exposes status and a url but no token, so a
    // token missed here means every later resume mints a fresh paid session. Read defensively like
    // the rest of this response — an older workflow version that omits it degrades to exactly the
    // pre-token behaviour (mint on retry) rather than failing the submit.
    return { ref, status: "pending", url: data.url ?? data.verification_url, token: data.session_token };
  }

  /**
   * Is this pending session in flight, or waiting on the rider? (P0-1 / D6.)
   *
   * The eng review killed the first design, which had the PHONE remember whether it had cancelled:
   * a client-only marker dies on reinstall, diverges across devices, and can contradict what actually
   * happened. Didit's decision endpoint knows the truth, so read it.
   *
   * Fails SOFT, always. This runs inside the rider's own profile read; a vendor blip must cost them a
   * needless "Finish verifying" tap, never an error on the screen they are stuck behind. Unknown and
   * unreachable both mean `unfinished` — offering a resume to someone genuinely mid-check wastes one
   * tap, while withholding it from someone who cancelled strands them entirely.
   */
  async pendingState(ref: string): Promise<ServerKycPendingState> {
    const status = await this.sessionStatus(ref);
    return status ? mapDiditPendingState(status) : "unfinished";
  }

  /**
   * The session's raw Didit status from the decision endpoint, or null when it can't be read. Fails
   * SOFT, always (see `pendingState` above, which it backs): never throws, never logs the ref beside
   * anything token-shaped.
   */
  async sessionStatus(ref: string): Promise<string | null> {
    const apiKey = this.env.DIDIT_API_KEY;
    if (!apiKey || !ref) return null;

    try {
      const res = await fetch(`${this.env.DIDIT_BASE_URL}/v3/session/${encodeURIComponent(ref)}/decision/`, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(DIDIT_DECISION_TIMEOUT_MS),
      });
      if (!res.ok) {
        // debug, not warn: a 404 here is ordinary (a session garbage-collected vendor-side), and this
        // path runs on the board's poll — warning would bury the log in noise for a state we handle by design.
        this.logger.debug(`Didit decision read for ${ref}: ${res.status} — no status`);
        return null;
      }
      // KYC-R26-11: the decision body is the rider's full verification record (document fields, face data).
      // This path exists to read ONE field: `status` is copied out and the parsed body goes out of scope
      // here — nothing else of it is returned, cached (KycPendingStateService keeps only the derived class)
      // or logged (the log lines in this method carry the ref and an HTTP status, never the body).
      const data = (await res.json()) as { status?: unknown };
      const status = data.status;
      return typeof status === "string" && status ? status.slice(0, 64) : null;
    } catch (err) {
      this.logger.debug(`Didit decision read failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * KYC-R26-03: the full decision payload for the lost-webhook reconciler (it has the same shape as the
   * webhook body's decision: `status`, `decision.face_matches[]`, `decision.id_verifications[]`…). PII — the
   * caller extracts what the webhook path persists and drops the rest. Never throws; never logs the body.
   */
  async sessionDecision(ref: string): Promise<unknown> {
    const apiKey = this.env.DIDIT_API_KEY;
    if (!apiKey || !ref) return null;
    try {
      const res = await fetch(`${this.env.DIDIT_BASE_URL}/v3/session/${encodeURIComponent(ref)}/decision/`, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(DIDIT_BACKGROUND_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.debug(`Didit decision read for ${ref} (reconcile): ${res.status}`);
        return null;
      }
      return (await res.json()) as unknown;
    } catch (err) {
      this.logger.debug(`Didit decision read failed (reconcile): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * KYC-R26-05: delete a session at Didit (`DELETE /v3/session/{id}/delete/`) — Didit drops the session's
   * images, extracted data and decision. 404 is success (already deleted, or garbage-collected). Never throws:
   * erasure must not fail permanently because Didit is down — the caller logs a `false` for follow-up.
   */
  async deleteSession(ref: string): Promise<boolean> {
    const apiKey = this.env.DIDIT_API_KEY;
    if (!ref) return true;
    if (!apiKey) return false;
    try {
      const res = await fetch(`${this.env.DIDIT_BASE_URL}/v3/session/${encodeURIComponent(ref)}/delete/`, {
        method: "DELETE",
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(DIDIT_BACKGROUND_TIMEOUT_MS),
      });
      if (res.ok || res.status === 404) return true;
      this.logger.warn(`Didit session delete for ${ref}: ${res.status}`);
      return false;
    } catch (err) {
      this.logger.warn(`Didit session delete for ${ref} failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}
