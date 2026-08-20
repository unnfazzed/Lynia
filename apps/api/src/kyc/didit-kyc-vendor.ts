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
    const apiKey = this.env.DIDIT_API_KEY;
    if (!apiKey || !ref) return "unfinished";

    try {
      const res = await fetch(`${this.env.DIDIT_BASE_URL}/v3/session/${encodeURIComponent(ref)}/decision/`, {
        headers: { "x-api-key": apiKey },
        signal: AbortSignal.timeout(DIDIT_DECISION_TIMEOUT_MS),
      });
      if (!res.ok) {
        // debug, not warn: a 404 here is ordinary (a session garbage-collected vendor-side), and this
        // path runs on a 5s poll — warning would bury the log in noise for a state we handle by design.
        this.logger.debug(`Didit decision read for ${ref}: ${res.status} — defaulting to unfinished`);
        return "unfinished";
      }
      const data = (await res.json()) as { status?: string };
      return data.status ? mapDiditPendingState(data.status) : "unfinished";
    } catch (err) {
      // Never log `ref` alongside anything token-shaped, and never rethrow: see the doc comment.
      this.logger.debug(`Didit decision read failed: ${err instanceof Error ? err.message : String(err)}`);
      return "unfinished";
    }
  }
}
