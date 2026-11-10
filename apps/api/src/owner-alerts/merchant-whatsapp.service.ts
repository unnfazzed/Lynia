import { Inject, Injectable, Logger } from "@nestjs/common";
import { orderShortId } from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

/** One Bird call never holds a socket longer than this; the WhatsApp is dropped, the order it rode on is not. */
const BIRD_WHATSAPP_TIMEOUT_MS = 10_000;

/**
 * Bird's managed utility template (owner, 2026-11-10). We have no WhatsApp Business number of our own, so the
 * only WhatsApp we can send is one of Bird's catalog templates, from Bird's number, with Bird's fixed wording:
 *   "Your order {{ref}} has been confirmed for a total of {{amount}}. Thanks for shopping with us."
 * Read through the Bird connector 2026-11-10 (live version wav_01ky4x8e4ger5apvse2ja3k2mw, `en` only,
 * on_missing_language: fail). A managed template must NOT name `from` (Bird answers 422 E15018).
 */
export const NEW_ORDER_TEMPLATE = "bird_order_confirmation";

/** "USD 16.50" — the template's own sample format ("EUR 49.99"). */
export function templateAmount(value: unknown): string {
  return `USD ${(Math.round(Number(value) * 100) / 100).toFixed(2)}`;
}

/** The region host for a workspace key (`bk_<region>_…`), or null for a key of another shape. */
export function birdHostForKey(key: string): string | null {
  const m = /^bk_([a-z0-9]+)_/.exec(key);
  return m ? `https://${m[1]}.platform.bird.com` : null;
}

/** The send body for one new order: the shop's phone, the template, its two values. */
export function newOrderMessage(input: { phone: string; orderId: string; total: unknown }) {
  return {
    to: input.phone,
    template: {
      slug: NEW_ORDER_TEMPLATE,
      language: "en",
      parameters: { ref: orderShortId(input.orderId), amount: templateAmount(input.total) },
    },
  };
}

/** The distinct, non-blank phones of a team, in order. */
export function teamPhones(phones: readonly (string | null | undefined)[]): string[] {
  return [...new Set(phones.map((p) => p?.trim()).filter((p): p is string => !!p))];
}

/**
 * Tells everyone on a restaurant / shop / pharmacy team on WhatsApp that a customer has placed an order with it, alongside the
 * in-app queue push (owner request 2026-11-10). Sent through Bird's WhatsApp API with the workspace key the
 * API already holds for Bird Verify.
 *
 * Fire-and-forget by contract, like OwnerAlertsService: `newOrder` never throws and never awaits the network
 * on the caller's path, so a WhatsApp can never fail or slow an order. Inert unless
 * WHATSAPP_ORDER_ALERTS_ENABLED=true and a Bird key is present.
 */
@Injectable()
export class MerchantWhatsAppService {
  private readonly logger = new Logger(MerchantWhatsAppService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  private get key(): string | undefined {
    return this.env.BIRD_VERIFY_API_KEY || this.env.BIRD_ACCESS_KEY || undefined;
  }

  get enabled(): boolean {
    return this.env.WHATSAPP_ORDER_ALERTS_ENABLED === "true" && !!this.key;
  }

  /**
   * One WhatsApp per distinct phone on the venue's team (owner + staff, owner 2026-11-10): blanks dropped,
   * the same number never messaged twice. Each send fails on its own; one bad number never stops the rest.
   */
  newOrder(input: { phones: readonly (string | null | undefined)[]; orderId: string; total: unknown }): void {
    if (!this.enabled) return;
    for (const phone of teamPhones(input.phones)) {
      void this.send(newOrderMessage({ phone, orderId: input.orderId, total: input.total })).catch((err: unknown) => {
        this.logger.warn(
          `new-order WhatsApp not sent to ${maskPhone(phone)} (order ${orderShortId(input.orderId)}): ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  }

  private async send(body: ReturnType<typeof newOrderMessage>): Promise<void> {
    const key = this.key!;
    const host = birdHostForKey(key);
    if (!host) throw new Error("Bird key doesn't look like a workspace key (expected bk_<region>_…)");
    const res = await fetch(`${host}/v1/whatsapp/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(BIRD_WHATSAPP_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Bird's error code only (e.g. E15018); never the body's echo of the phone.
      const detail = await res.json().then((j) => (j as { code?: string } | null)?.code ?? "", () => "");
      throw new Error(`Bird answered ${res.status}${detail ? ` ${detail}` : ""}`);
    }
  }
}
