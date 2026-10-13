/**
 * Admin console v2 PR 3 (docs/plans/2026-10-13-admin-console-v2.md §4, §8): helpers the audit viewer, the global
 * search and the person timeline share — keyset cursors, Harare-day ranges and uuid-prefix ranges. Pure, so
 * they're unit-tested directly.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): boolean {
  return typeof v === "string" && UUID_RE.test(v);
}

/** A keyset position: the row's time plus a unique tiebreak key. Newest-first lists page strictly "after" it. */
export interface Cursor {
  at: Date;
  key: string;
}

/** Opaque `?cursor=` value: base64url of `<iso>|<key>`. */
export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.at.toISOString()}|${c.key}`, "utf8").toString("base64url");
}

/** Parse a `?cursor=`; null when absent or malformed (a bad cursor restarts at the newest page, never a 500). */
export function decodeCursor(raw: unknown): Cursor | null {
  // A repeated `?cursor=a&cursor=b` arrives as an array: only a single string is a cursor.
  if (typeof raw !== "string" || !raw || raw.length > 400) return null;
  let text: string;
  try {
    text = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const bar = text.indexOf("|");
  if (bar <= 0) return null;
  const at = new Date(text.slice(0, bar));
  const key = text.slice(bar + 1);
  if (Number.isNaN(at.getTime()) || !key) return null;
  return { at, key };
}

/** True when a row sorts strictly after the cursor in (at desc, key desc) order — i.e. belongs on a later page. */
export function isAfterCursor(row: Cursor, cursor: Cursor | null): boolean {
  if (!cursor) return true;
  const d = row.at.getTime() - cursor.at.getTime();
  if (d !== 0) return d < 0;
  return row.key < cursor.key;
}

/** Newest first, ties broken by key (desc) — the one order every merged list uses. */
export function byNewest(a: Cursor, b: Cursor): number {
  const d = b.at.getTime() - a.at.getTime();
  if (d !== 0) return d;
  return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
}

/** Harare is UTC+2 all year (no DST). */
const HARARE_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A `from` / `to` query value → an instant. A bare `YYYY-MM-DD` is a Harare calendar day: `from` is its 00:00
 * Harare, `to` is the END of that day (the next day's 00:00, used exclusively), so `from=to=2026-10-13` means
 * "the whole of 13 October in Harare". Any other value is read as an ISO instant. Null when unparseable.
 */
export function parseHarareBound(raw: unknown, edge: "from" | "to"): Date | null {
  if (typeof raw !== "string" || !raw) return null;
  const v = raw.trim();
  const m = DAY_RE.exec(v);
  if (m) {
    const startUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - HARARE_OFFSET_MS;
    if (Number.isNaN(startUtc)) return null;
    return new Date(edge === "from" ? startUtc : startUtc + DAY_MS);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A short id or uuid prefix (`#a1b2c3`, `a1b2c3d4-…`) → the inclusive uuid range it names, so a prefix lookup is
 * a primary-key range scan instead of a `id::text LIKE` sequential scan. Postgres orders uuids by their bytes,
 * which is the hex order of the text form. Null unless it is 6–32 hex digits (dashes ignored).
 */
export function uuidPrefixRange(raw: string): { gte: string; lte: string } | null {
  const hex = raw.trim().replace(/^#/, "").replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{6,32}$/.test(hex)) return null;
  const fmt = (h: string) => `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  return { gte: fmt(hex.padEnd(32, "0")), lte: fmt(hex.padEnd(32, "f")) };
}

/** Clamp a `?limit=` to [1, max], falling back to `dflt`. */
export function clampLimit(raw: unknown, dflt: number, max: number): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n) || n < 1) return dflt;
  return Math.min(Math.floor(n), max);
}

/** "#a1b2c3" — the console's short id (mirrors apps/admin format.ts shortId). */
export function shortId(id: string): string {
  return `#${id.replace(/-/g, "").slice(0, 6)}`;
}

/** "$1,234.50" / "−$3.00" (mirrors apps/admin format.ts money). */
export function money(v: { toString(): string } | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : Number(v.toString());
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `−$${abs}` : `$${abs}`;
}

/** "open_for_offers" → "Open for offers"; user-visible copy says "biker", never "rider" (D-101). */
export function humanize(v: string | null | undefined): string {
  if (!v) return "";
  const s = v.replace(/[._]/g, " ").replace(/\briders?\b/gi, (w) => (w.toLowerCase().endsWith("s") ? "bikers" : "biker")).trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
