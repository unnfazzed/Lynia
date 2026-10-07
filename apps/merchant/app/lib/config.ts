/**
 * API base URL for the merchant tablet. Unlike apps/admin (a server-only proxy that never ships an
 * API token to the browser), this app talks to `@lynia/api` directly from the client: the alarm/
 * reconnect discipline and (soon) the live queue socket all need to run in the tab itself, so the
 * merchant's own bearer token has to be readable by client JS. Must be prefixed `NEXT_PUBLIC_` to be
 * inlined into the browser bundle by Next.
 */
const configured = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!configured && process.env.NODE_ENV === "production") {
  // NEXT_PUBLIC_ vars are inlined at build time — failing here fails the build itself rather than
  // shipping a tablet that can never reach the API.
  throw new Error("Set NEXT_PUBLIC_API_BASE_URL to the production API URL.");
}

export const API_BASE_URL: string = configured ?? "http://localhost:3000";

/**
 * LyniaGo support on WhatsApp, in international digits (e.g. "263771234567"). Optional: Help opens it
 * (merchant web upgrade L2; help routes to WhatsApp by product decision), and with no number set the Help
 * item hides rather than opening a dead link — the mobile app's help row does the same. Set by the
 * `MERCHANT_SUPPORT_WHATSAPP` repository variable at build time (deploy-merchant-web.yml).
 */
export const SUPPORT_WHATSAPP: string | null = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/\D/g, "") || null;

export function supportWhatsAppUrl(text?: string): string | null {
  if (!SUPPORT_WHATSAPP) return null;
  return `https://wa.me/${SUPPORT_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Merchant v2 open question 1 (ledger D-77): the offline-rider hand-over fallback. Off until its API lands. */
export const HANDOVER_FALLBACK_ENABLED: boolean = process.env.NEXT_PUBLIC_MERCHANT_HANDOVER_FALLBACK === "1";
