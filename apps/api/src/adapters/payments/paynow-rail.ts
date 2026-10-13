import { Logger } from "@nestjs/common";
import type { Env } from "../../config/env";
import {
  PAYMENT_RAIL_DEFAULT_TIMEOUT_MS,
  type PaymentRail,
  type PaymentRailInitiate,
  type PaymentRailLookupOptions,
  type PaymentRailResult,
} from "./payment-rail.interface";
import {
  encodePaynowMessage,
  mapPaynowStatus,
  type PaynowMessage,
  parsePaynowMessage,
  paynowField,
  paynowPhone,
  paynowTrace,
  verifyPaynowMessage,
} from "./paynow";

/** The settings the Paynow rail runs on (validated together at boot: config/env.ts). */
export type PaynowConfig = Pick<
  Env,
  "PAYNOW_BASE_URL" | "PAYNOW_RETURN_URL"
> & { integrationId: string; integrationKey: string; authEmail: string; resultUrl: string };

/** What the biker sees on Paynow's side next to the charge. Never confidential (Paynow shows it). */
const ADDITIONAL_INFO = "Lynia biker wallet top-up";

/**
 * Paynow express checkout (developers.paynow.co.zw › Express Checkout), the live {@link PaymentRail}.
 *
 * `initiate` POSTs `/interface/remotetransaction` with `method=ecocash` (or innbucks / omari once they
 * are live) and the biker's line. EcoCash then pushes the USSD prompt to that handset. Paynow answers `Ok`
 * with a `pollurl` and its own reference, or `Error` (e.g. insufficient balance), which maps to `failed`.
 * `confirm` / `reconcile` POST the poll URL, or `/interface/trace` by our `merchanttrace` when the poll URL
 * never arrived. Every reply is hash-verified before anything is mapped. An unverifiable reply THROWS (it
 * is not a decline: money may be moving), and so does a transport failure or a timeout.
 *
 * The amount sent is the amount the caller asks for. Whether that already includes the biker's fee
 * (`PAYNOW_FEE_MODE`) is the wallet's decision, not this client's.
 */
export class PaynowRail implements PaymentRail {
  private readonly logger = new Logger(PaynowRail.name);
  private readonly origin: string;

  constructor(
    private readonly cfg: PaynowConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.origin = new URL(cfg.PAYNOW_BASE_URL).origin;
  }

  async initiate(intent: PaymentRailInitiate): Promise<PaymentRailResult> {
    if (intent.rail === "manual") return { status: "failed", rail: intent.rail, reason: "manual credits never go through a rail" };
    const phone = paynowPhone(intent.phone);
    if (!phone) return { status: "failed", rail: intent.rail, reason: "not a Zimbabwe mobile number" };
    const fields: PaynowMessage = [
      ["id", this.cfg.integrationId],
      ["reference", intent.topUpId],
      ["amount", intent.amount.toFixed(2)],
      ["additionalinfo", ADDITIONAL_INFO],
      ["returnurl", this.cfg.PAYNOW_RETURN_URL],
      ["resulturl", this.cfg.resultUrl],
      ["authemail", this.cfg.authEmail],
      ["phone", phone],
      ["method", intent.rail],
      ["merchanttrace", paynowTrace(intent.topUpId)],
      ["status", "Message"],
    ];
    const reply = await this.post("/interface/remotetransaction", encodePaynowMessage(fields, this.cfg.integrationKey), intent.timeoutMs);
    const status = (paynowField(reply, "status") ?? "").toLowerCase();
    if (status === "error") {
      // An immediate refusal (insufficient balance, a bad number…). Unsigned by design: nothing was charged.
      const reason = paynowField(reply, "error") ?? "Paynow refused the top-up";
      this.logger.log(`paynow initiate refused topUpId=${intent.topUpId}: ${reason}`);
      return { status: "failed", rail: intent.rail, reason, raw: Object.fromEntries(reply) };
    }
    if (status !== "ok") throw new Error(`Paynow initiate returned an unexpected status "${status}"`);
    this.assertSigned(reply, "initiate");
    return {
      status: "pending",
      rail: intent.rail,
      providerRef: paynowField(reply, "paynowreference"),
      pollUrl: this.trustedPollUrl(paynowField(reply, "pollurl")),
      amount: intent.amount,
      reason: paynowField(reply, "instructions"),
      raw: Object.fromEntries(reply),
    };
  }

  async confirm(providerRef: string, options?: PaymentRailLookupOptions): Promise<PaymentRailResult> {
    const pollUrl = this.trustedPollUrl(options?.pollUrl);
    let reply: PaynowMessage;
    if (pollUrl) {
      reply = await this.post(pollUrl, "", options?.timeoutMs);
    } else if (options?.topUpId) {
      const fields: PaynowMessage = [
        ["id", this.cfg.integrationId],
        ["merchanttrace", paynowTrace(options.topUpId)],
        ["status", "Message"],
      ];
      reply = await this.post("/interface/trace", encodePaynowMessage(fields, this.cfg.integrationKey), options?.timeoutMs);
    } else {
      return { status: "pending", providerRef, reason: "no poll URL or trace to look the charge up by" };
    }
    const status = paynowField(reply, "status") ?? "";
    // `NotFound` / `Error` from a lookup say nothing about whether money moved (Paynow's own note), so they
    // stay pending: the intent's window and the sweep's age bound decide what the biker sees.
    if (/^(notfound|error)$/i.test(status)) return { status: "pending", providerRef, reason: paynowField(reply, "error") ?? status, raw: Object.fromEntries(reply) };
    this.assertSigned(reply, "lookup");
    return this.toResult(reply, providerRef);
  }

  reconcile(providerRef: string, options?: PaymentRailLookupOptions): Promise<PaymentRailResult> {
    return this.confirm(providerRef, options);
  }

  /** A status update Paynow POSTed to our result URL, verified and mapped. Null when its hash fails. */
  readStatusUpdate(rawBody: string): (PaymentRailResult & { reference?: string }) | null {
    const message = parsePaynowMessage(rawBody);
    if (!verifyPaynowMessage(message, this.cfg.integrationKey)) return null;
    return { ...this.toResult(message, paynowField(message, "paynowreference")), reference: paynowField(message, "reference") };
  }

  private toResult(message: PaynowMessage, fallbackRef?: string): PaymentRailResult {
    const amount = Number(paynowField(message, "amount"));
    return {
      status: mapPaynowStatus(paynowField(message, "status")),
      providerRef: paynowField(message, "paynowreference") ?? fallbackRef,
      pollUrl: this.trustedPollUrl(paynowField(message, "pollurl")),
      amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : undefined,
      reason: paynowField(message, "status"),
      raw: Object.fromEntries(message),
    };
  }

  private assertSigned(reply: PaynowMessage, what: string): void {
    if (!verifyPaynowMessage(reply, this.cfg.integrationKey)) throw new Error(`Paynow ${what} reply failed hash verification`);
  }

  /** Only ever POST to Paynow's own host, whatever a message claims the poll URL is. */
  private trustedPollUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
      return new URL(url).origin === this.origin ? url : undefined;
    } catch {
      return undefined;
    }
  }

  private async post(pathOrUrl: string, body: string, timeoutMs?: number): Promise<PaynowMessage> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.origin}${pathOrUrl}`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(timeoutMs ?? PAYMENT_RAIL_DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Paynow ${new URL(url).pathname} answered HTTP ${res.status}`);
    return parsePaynowMessage(await res.text());
  }
}
