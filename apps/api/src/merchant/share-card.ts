import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ShopShareService } from "@lynia/shared";

/**
 * The WhatsApp preview card for a shop link (handoff shop-share-v1 README §4 "og:image", SH-W7a/b/c): a 1200×630
 * JPEG the website serves at `lyniago.com/s/<CODE>/card.jpg`.
 *
 *   Normal    the 3:1 cover across the top, white below, the ringed logo centred over the seam, the name, the pill.
 *   No photo  the service tint with yellow/coral/sky circles instead of the cover; the logo is tint + initial.
 *   Generic   (dead code) green, the yellow circle, the white disc with the mark, "LyniaGo". Names no shop.
 *
 * Drawn with sharp in the design's own fonts (Inter 700, Fredoka 600, the website's files in assets/share-card/).
 */

export const CARD_W = 1200;
export const CARD_H = 630;
const COVER_H = 400;
const LOGO = 168;
const RING = 8;
const LOGO_TOP = 316;
const NAME_TOP = 500;
const NAME_SIDE = 60;
const JPEG_QUALITY = 80;

const INK = "#14181B";
const GREEN = "#00B14F";
const YELLOW = "#FFD23F";
const CORAL = "#FF6B4A";
const SKY = "#3EC1F3";

/** The no-photo cover band, by section (README §4 "No photo"). */
const BAND: Record<ShopShareService, string> = { shops: "#DDD5FF", restaurants: "#FFD9CC", pharmacy: "#C5E9DF" };
/** The no-logo disc: kind tint + initial, as Browse v2 draws it. */
const LOGO_TINT: Record<ShopShareService, { bg: string; ink: string }> = {
  shops: { bg: "#F6F7F8", ink: INK },
  restaurants: { bg: "#FFD9CC", ink: INK },
  pharmacy: { bg: "#DFF4EE", ink: "#006630" },
};

const ASSETS = join(__dirname, "..", "..", "assets", "share-card");
const INTER_BOLD = join(ASSETS, "inter-700.ttf");
const FREDOKA = join(ASSETS, "fredoka-600.ttf");
let markSvg: string | null = null;
const mark = () => (markSvg ??= readFileSync(join(ASSETS, "lyniago-mark.svg"), "utf8"));

export interface ShareCardShop {
  name: string;
  service: ShopShareService;
  /** The logo's thumbnail bytes, or null (tint + initial). */
  logo: Buffer | null;
  /** The cover's thumbnail bytes, or null (tint band). */
  cover: Buffer | null;
}

type Sharp = typeof import("sharp");
type Layer = { input: Buffer; left: number; top: number };

/** The card for a live shop, or the generic card when `shop` is null. JPEG q80. */
export async function renderShareCard(shop: ShareCardShop | null): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const layers = shop ? await shopLayers(sharp, shop) : await genericLayers(sharp);
  return sharp({ create: { width: CARD_W, height: CARD_H, channels: 3, background: shop ? "#ffffff" : GREEN } })
    .composite(layers)
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

async function shopLayers(sharp: Sharp, shop: ShareCardShop): Promise<Layer[]> {
  const layers: Layer[] = [];
  const cover = shop.cover ? await photo(sharp, shop.cover, CARD_W, COVER_H) : null;
  layers.push({ input: cover ?? (await svg(sharp, band(BAND[shop.service]))), left: 0, top: 0 });

  layers.push({ input: await logoDisc(sharp, shop), left: (CARD_W - LOGO) / 2, top: LOGO_TOP });

  const name = await oneLine(sharp, shop.name, CARD_W - 2 * NAME_SIDE);
  const { width = 0 } = await sharp(name).metadata();
  layers.push({ input: name, left: Math.round((CARD_W - width) / 2), top: NAME_TOP });

  layers.push(...(await pill(sharp)));
  return layers;
}

/** The 3:1 band with the yellow/coral/sky circles (positions from ss-web.js `og`, at full size). */
function band(fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${COVER_H}">
<rect width="100%" height="100%" fill="${fill}"/>
${circle(CARD_W + 90 - 300, -120, 300, YELLOW)}${circle(CARD_W - 260 - 48, 220, 48, CORAL)}${circle(CARD_W - 90 - 28, 300, 28, SKY)}
</svg>`;
}

/** A circle given its bounding box's top-left corner and diameter, as the CSS draws them. */
function circle(left: number, top: number, size: number, fill: string): string {
  const r = size / 2;
  return `<circle cx="${left + r}" cy="${top + r}" r="${r}" fill="${fill}"/>`;
}

async function logoDisc(sharp: Sharp, shop: ShareCardShop): Promise<Buffer> {
  const inner = LOGO - 2 * RING;
  const ring = await svg(sharp, `<svg xmlns="http://www.w3.org/2000/svg" width="${LOGO}" height="${LOGO}">${circle(0, 0, LOGO, "#ffffff")}</svg>`);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}">${circle(0, 0, inner, "#fff")}</svg>`);
  let face: Buffer | null = shop.logo ? await photo(sharp, shop.logo, inner, inner) : null;
  if (face) face = await sharp(face).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  if (!face) {
    const tint = LOGO_TINT[shop.service];
    const disc = await svg(sharp, `<svg xmlns="http://www.w3.org/2000/svg" width="${inner}" height="${inner}">${circle(0, 0, inner, tint.bg)}</svg>`);
    const initial = await text(sharp, initialOf(shop.name), INTER_BOLD, "LyniaCard Inter", 700, Math.round(LOGO * 0.4), tint.ink);
    const meta = await sharp(initial).metadata();
    face = await sharp(disc)
      .composite([{ input: initial, left: Math.round((inner - (meta.width ?? 0)) / 2), top: Math.round((inner - (meta.height ?? 0)) / 2) }])
      .png()
      .toBuffer();
  }
  return sharp(ring).composite([{ input: face, left: RING, top: RING }]).png().toBuffer();
}

/** LyniaGo pill, top right: white, 64 tall, padding 0 24 0 16, mark 40 + gap 12 + Fredoka 34. */
async function pill(sharp: Sharp): Promise<Layer[]> {
  const word = await text(sharp, "LyniaGo", FREDOKA, "LyniaCard Fredoka", 600, 34, INK);
  const { width: ww = 0, height: wh = 0 } = await sharp(word).metadata();
  const h = 64;
  const w = 16 + 40 + 12 + ww + 24;
  const left = CARD_W - 28 - w;
  const top = 28;
  const bg = await svg(sharp, `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${h / 2}" fill="#fff"/></svg>`);
  return [
    { input: bg, left, top },
    { input: await markPng(sharp, 40), left: left + 16, top: top + (h - 40) / 2 },
    { input: word, left: left + 16 + 40 + 12, top: top + Math.round((h - wh) / 2) },
  ];
}

async function genericLayers(sharp: Sharp): Promise<Layer[]> {
  const shapes = await svg(
    sharp,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}">${circle(CARD_W + 160 - 520, -220, 520, YELLOW)}${circle(120, CARD_H - 90 - 60, 60, CORAL)}${circle((CARD_W - LOGO) / 2, 170, LOGO, "#fff")}</svg>`,
  );
  const word = await text(sharp, "LyniaGo", FREDOKA, "LyniaCard Fredoka", 600, 84, "#ffffff");
  const { width = 0 } = await sharp(word).metadata();
  return [
    { input: shapes, left: 0, top: 0 },
    { input: await markPng(sharp, 100), left: (CARD_W - 100) / 2, top: 170 + (LOGO - 100) / 2 },
    { input: word, left: Math.round((CARD_W - width) / 2), top: 170 + LOGO + 28 },
  ];
}

/** A photo cropped to fill w×h (the CSS `center/cover`). */
async function photo(sharp: Sharp, input: Buffer, w: number, h: number): Promise<Buffer | null> {
  try {
    return await sharp(input, { failOn: "error", limitInputPixels: 12_000_000 })
      .rotate()
      .resize(w, h, { fit: "cover", position: "centre" })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
  } catch {
    return null; // an unreadable photo falls back to the tint, never fails the card
  }
}

const svg = (sharp: Sharp, source: string) => sharp(Buffer.from(source)).png().toBuffer();
const markPng = (sharp: Sharp, size: number) => sharp(Buffer.from(mark())).resize(size, size).png().toBuffer();

/** Pango markup needs &, < and > escaped. */
function escapeMarkup(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function text(sharp: Sharp, s: string, fontfile: string, family: string, weight: number, px: number, color: string, letterSpacing = 0) {
  // Pango sizes are points; at 72 dpi a point is a pixel. letter_spacing is in 1/1024 pt.
  const spacing = letterSpacing ? ` letter_spacing="${Math.round(letterSpacing * 1024)}"` : "";
  return sharp({
    text: {
      text: `<span font_family="${family}" font_weight="${weight}" foreground="${color}"${spacing}>${escapeMarkup(s)}</span>`,
      font: `${px}`,
      fontfile,
      dpi: 72,
      rgba: true,
    },
  })
    .png()
    .toBuffer();
}

/** The name at 60/700, −2px, on one line: cut with an ellipsis until it fits `max` pixels. */
async function oneLine(sharp: Sharp, name: string, max: number): Promise<Buffer> {
  const draw = (s: string) => text(sharp, s, INTER_BOLD, "LyniaCard Inter", 700, 60, INK, -2);
  const full = await draw(name);
  if (((await sharp(full).metadata()).width ?? 0) <= max) return full;
  const chars = Array.from(name);
  let lo = 1;
  let hi = chars.length - 1;
  let best = await draw("…");
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = await draw(`${chars.slice(0, mid).join("").trimEnd()}…`);
    if (((await sharp(candidate).metadata()).width ?? 0) <= max) {
      best = candidate;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/** The disc's letter: the first letter or digit of the name, upper case. */
export function initialOf(name: string): string {
  const m = /[\p{L}\p{N}]/u.exec(name);
  return m ? m[0].toUpperCase() : "?";
}
