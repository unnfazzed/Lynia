import { Inject, Injectable, Logger } from "@nestjs/common";
import { isBusinessBookingAccountPhone, OFFER_WINDOW_POLICY, RESTAURANTS_TIMING } from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";

/** One Telegram call never holds a socket longer than this; the alert is dropped, the request it rode on is not. */
const TELEGRAM_TIMEOUT_MS = 5_000;
/** Free text (landmarks, item lists, names) is clipped so one alert stays a glanceable phone notification. */
const MAX_FIELD = 80;

function clip(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > MAX_FIELD ? `${t.slice(0, MAX_FIELD - 1)}…` : t;
}

function usd(value: unknown): string {
  return `$${(Math.round(Number(value) * 100) / 100).toFixed(2)}`;
}

/** The admin console's order page: each order alert links straight to it. */
const ADMIN_ORDER_URL = "https://admin.lyniago.com/orders/";

/** "+263771234567" → "https://wa.me/263771234567": one tap opens a WhatsApp chat with the venue. */
function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

/** Who placed an order. Every order alert names them (owner, 2026-10-18: "number and name"). */
export interface OrderSender {
  firstName: string;
  lastName: string;
  phone: string | null;
}

/** "🙋 Tendai Moyo · +263… · wa.me link". A shop booking's sender is the venue's booking account, not a person. */
function senderLine(sender: OrderSender): string {
  if (isBusinessBookingAccountPhone(sender.phone)) return "🙋 Shop booking (sent by a venue)";
  const name = clip(`${sender.firstName} ${sender.lastName}`) || "No name yet";
  return sender.phone ? `🙋 ${name} · ${sender.phone} · ${waLink(sender.phone)}` : `🙋 ${name}`;
}

/**
 * The alert texts, kept pure so the spec pins them. Plain text (no parse_mode), so nothing a customer
 * typed can break the message's markup; Telegram still makes the links and numbers tappable.
 *
 * Each order alert carries what the owner acts on (owner, 2026-10-18): a parcel request says how many
 * bikers are online near the pickup, so a thin market is a cue to get bikers online; a venue order
 * carries the venue's number, so the owner can call or WhatsApp it to take the order. Both carry the
 * sender's name and full number (owner's call); only the sign-up alert masks a phone.
 */
export const ownerAlertText = {
  signUp(phone: string): string {
    return `👤 New sign-up\n${maskPhone(phone)}`;
  },
  bikerApplication(input: { firstName: string; kycStatus: string }): string {
    const check = input.kycStatus === "verified" ? "ID check passed" : "ID check pending";
    return `🛵 New biker application\n${clip(input.firstName)} · ${check}`;
  },
  parcelOrder(input: {
    orderId: string;
    proposedFare: unknown;
    distanceKm: number | null;
    pickup: string;
    dropoff: string;
    items: string;
    /** Online bikers the broadcast reached; null when the geo lookup failed. */
    bikersNearby: number | null;
    sender: OrderSender;
  }): string {
    const n = input.bikersNearby;
    const supply =
      n === null
        ? "Bikers online nearby: unknown"
        : n === 0
          ? "⚠️ No bikers online nearby. Get bikers online"
          : n < OFFER_WINDOW_POLICY.quietBelowRiders
            ? `⚠️ Only ${n} ${n === 1 ? "biker" : "bikers"} online nearby. Get more online`
            : `${n} bikers online nearby`;
    return [
      `📦 New parcel request · ${usd(input.proposedFare)}`,
      `${clip(input.pickup)} → ${clip(input.dropoff)}${input.distanceKm === null ? "" : ` · ${input.distanceKm.toFixed(1)} km`}`,
      clip(input.items),
      senderLine(input.sender),
      supply,
      `${ADMIN_ORDER_URL}${input.orderId}`,
    ].join("\n");
  },
  merchantOrder(input: {
    orderId: string;
    merchantName: string;
    /** The venue's number (its owner's sign-in phone, the one customers see); null when it has no owner. */
    merchantPhone: string | null;
    businessType: string;
    shopKind: string | null;
    total: unknown;
    items: string;
    paymentMethod: string;
    /** awaiting_accept (the venue must accept) or preparing (auto-accepted). */
    merchantPhase: string;
    scheduled: boolean;
    sender: OrderSender;
  }): string {
    const [icon, kind] =
      input.businessType !== "shop" ? ["🍔", "restaurant"] : input.shopKind === "pharmacy" ? ["💊", "pharmacy"] : ["🛒", "shop"];
    const pay = input.paymentMethod === "cash" ? "Cash" : "Wallet";
    const state = input.scheduled
      ? "Scheduled. Rings the venue at its time"
      : input.merchantPhase === "awaiting_accept"
        ? `⏱ Venue must accept within ${Math.round(RESTAURANTS_TIMING.acceptWindowMs / 60_000)} min`
        : "Auto-accepted. Venue to confirm and start";
    return [
      `${icon} New ${kind} order · ${usd(input.total)} · ${pay}`,
      clip(input.merchantName),
      clip(input.items),
      state,
      input.merchantPhone ? `📞 ${input.merchantPhone} · ${waLink(input.merchantPhone)}` : "📞 No venue number on file",
      senderLine(input.sender),
      `${ADMIN_ORDER_URL}${input.orderId}`,
    ].join("\n");
  },
};

/**
 * Tells the owner, on their phone, the moment the platform gains a customer, a biker applicant or an
 * order (owner request 2026-10-18). Delivered by a Telegram bot: free, instant, no template approval.
 *
 * Fire-and-forget by contract: `notify` never throws, never awaits the network on the caller's path,
 * and swallows every failure into a warning, so an alert can never fail or slow a sign-up or an order.
 * Inert (no network at all) unless TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are both set.
 */
@Injectable()
export class OwnerAlertsService {
  private readonly logger = new Logger(OwnerAlertsService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  get enabled(): boolean {
    return !!this.env.TELEGRAM_BOT_TOKEN && !!this.env.TELEGRAM_CHAT_ID;
  }

  notify(text: string): void {
    if (!this.enabled) return;
    void this.send(text).catch((err: unknown) => {
      // The message only: a fetch error never carries the URL, so the bot token cannot leak here.
      this.logger.warn(`owner alert not sent: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  private async send(text: string): Promise<void> {
    const res = await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: this.env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Telegram answered ${res.status}`);
  }
}
