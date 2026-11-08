/**
 * Shop share links (plan `docs/plans/2026-11-07-shop-share-links.md`). A restaurant, shop or pharmacy, or any
 * customer, shares a link that carries the shop's name and a short code:
 *
 *   lyniago.com/s/chicken-inn-avondale-7KQ2MX
 *
 * **Only the code decides which shop opens.** The name part is for people to read, so it can never point a
 * link at another shop: a renamed shop's old links still work, `lyniago.com/s/7KQ2MX` works, and a made-up
 * name (`/s/kfc-7KQ2MX`) still opens the shop that owns 7KQ2MX. Whoever serves the link (the website Worker,
 * the app) compares the name part with `shopSlug(currentName)` and redirects to the canonical link when they
 * differ (`isCanonicalShopLink`).
 *
 * This module is the one shape of a link, shared by the API (minting codes, building links), the app
 * (`lynia://s/…`, `app.lyniago.com/s/…`, the Play referrer) and the merchant app (the share sheet). The website
 * Worker can't import it and keeps its own copy; both sides' tests pin the examples below.
 */
import { installReferrerParams } from "./install-referrer";
import { REFERRAL_CODE_ALPHABET } from "./referral";

/** Same alphabet as biker referral codes: no 0/O, 1/I/L, so a code read out or typed by hand stays unambiguous. */
export const SHOP_CODE_ALPHABET = REFERRAL_CODE_ALPHABET;
export const SHOP_CODE_LENGTH = 6;
const CODE_RE = new RegExp(`^[${SHOP_CODE_ALPHABET}]{${SHOP_CODE_LENGTH}}$`);

/** The longest name part, so a link still fits a WhatsApp preview line. Cut at a word boundary when it can. */
export const SHOP_SLUG_MAX = 40;

export const SHOP_LINK_HOST = "lyniago.com";
export const SHOP_LINK_PATH_PREFIX = "/s/";
export const SHOP_LINK_BASE = `https://${SHOP_LINK_HOST}${SHOP_LINK_PATH_PREFIX}`;

/** The Play referrer's `utm_medium` that marks a shop link (never `biker_referral`, never a fleet invite). */
export const SHOP_UTM_MEDIUM = "shop_share";

/** A code as typed or carried in a link (any case, stray spaces) → its canonical upper-case form, or null. */
export function normalizeShopCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) ? code : null;
}

/**
 * A shop's name → the readable part of its link: lower case, ASCII letters and digits, words joined by single
 * dashes, at most `SHOP_SLUG_MAX` characters. Accents fold (`Café` → `cafe`), apostrophes vanish (`Mbuya's` →
 * `mbuyas`), `&` reads as `and`. A name with nothing usable left (emoji only, another script) gives "" and the
 * link is the bare code.
 */
export function shopSlug(name: unknown): string {
  if (typeof name !== "string") return "";
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining marks left by NFKD: é → e
    .toLowerCase()
    .replace(/['’‘`´]/g, "") // mbuya's → mbuyas, not mbuya-s
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  let slug = "";
  for (const word of words) {
    const next = slug ? `${slug}-${word}` : word;
    if (next.length > SHOP_SLUG_MAX) {
      // The first word alone is too long: cut it rather than return nothing.
      if (!slug) slug = word.slice(0, SHOP_SLUG_MAX);
      break;
    }
    slug = next;
  }
  return slug;
}

/** `/s/chicken-inn-avondale-7KQ2MX` (or `/s/7KQ2MX` when the name gives no slug). */
export function shopLinkPath(name: unknown, code: string): string {
  const slug = shopSlug(name);
  return `${SHOP_LINK_PATH_PREFIX}${slug ? `${slug}-` : ""}${code}`;
}

/** The link people share: `https://lyniago.com/s/chicken-inn-avondale-7KQ2MX`. */
export function shopLink(name: unknown, code: string): string {
  return `https://${SHOP_LINK_HOST}${shopLinkPath(name, code)}`;
}

export interface ParsedShopLink {
  /** The canonical code: the only part that picks the shop. */
  code: string;
  /** The name part exactly as it arrived (lower-cased), "" for a bare-code link. Never trusted. */
  slug: string;
}

/**
 * Reads the last path segment of a shop link: `chicken-inn-avondale-7KQ2MX`, `7KQ2MX`, `7kq2mx`, with or without
 * the `/s/` prefix or a trailing slash, URL-encoded or not. The code is whatever follows the last dash. Returns
 * null when there is no valid code.
 */
export function parseShopLink(pathOrSegment: unknown): ParsedShopLink | null {
  if (typeof pathOrSegment !== "string") return null;
  let segment = pathOrSegment.trim();
  if (segment.startsWith(SHOP_LINK_PATH_PREFIX)) segment = segment.slice(SHOP_LINK_PATH_PREFIX.length);
  if (segment.endsWith("/")) segment = segment.slice(0, -1);
  if (!segment || segment.includes("/")) return null;
  try {
    segment = decodeURIComponent(segment);
  } catch {
    return null;
  }
  const dash = segment.lastIndexOf("-");
  const code = normalizeShopCode(dash === -1 ? segment : segment.slice(dash + 1));
  if (!code) return null;
  return { code, slug: dash === -1 ? "" : segment.slice(0, dash).toLowerCase() };
}

/**
 * Whether a link that arrived as `parsed` already reads as the shop's current link. When it doesn't (renamed
 * shop, bare code, made-up name), the server redirects to `shopLinkPath(currentName, parsed.code)`.
 */
export function isCanonicalShopLink(parsed: ParsedShopLink, currentName: unknown): boolean {
  return parsed.slug === shopSlug(currentName);
}

/** The install-referrer string the website puts in the Play link for a shop code (decoded form). */
export function shopInstallReferrer(code: string): string {
  return `utm_source=lyniago.com&utm_medium=${SHOP_UTM_MEDIUM}&utm_campaign=${SHOP_UTM_MEDIUM}&utm_content=${code}`;
}

/** The shop code inside a Play install referrer, or null when this install didn't come from a shop link. */
export function shopCodeFromInstallReferrer(referrer: unknown): string | null {
  const params = installReferrerParams(referrer);
  if (params.get("utm_medium") !== SHOP_UTM_MEDIUM) return null;
  return normalizeShopCode(params.get("utm_content"));
}
