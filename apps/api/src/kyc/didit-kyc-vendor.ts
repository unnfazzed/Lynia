import { Logger } from "@nestjs/common";
import type { Env } from "../config/env";
import type { KycSubmission, KycVendor } from "./kyc-vendor";

/**
 * Didit KYC (verifies Zimbabwean national IDs). Creates a verification session; the rider opens
 * the returned URL, and Didit posts an HMAC-signed status webhook to our /kyc/callback.
 * Field/header names follow Didit's v3 API; the response is read defensively to tolerate aliases.
 */
export class DiditKycVendor implements KycVendor {
  private readonly logger = new Logger(DiditKycVendor.name);

  constructor(private readonly env: Env) {}

  async submit(riderId: string): Promise<KycSubmission> {
    const apiKey = this.env.DIDIT_API_KEY;
    const workflowId = this.env.DIDIT_WORKFLOW_ID;
    if (!apiKey || !workflowId) {
      throw new Error("Didit not configured (DIDIT_API_KEY / DIDIT_WORKFLOW_ID)");
    }

    const res = await fetch(`${this.env.DIDIT_BASE_URL}/v3/session/`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: riderId,
        ...(this.env.DIDIT_CALLBACK_URL ? { callback: this.env.DIDIT_CALLBACK_URL } : {}),
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Didit session create failed: ${res.status} ${text.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      session_id?: string;
      id?: string;
      url?: string;
      verification_url?: string;
    };
    const ref = data.session_id ?? data.id;
    if (!ref) throw new Error("Didit response missing session id");
    return { ref, status: "pending", url: data.url ?? data.verification_url };
  }
}
