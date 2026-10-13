/** One place for how the console prints times, money and ids. Every timestamp is Harare time
 *  (the server renders in the container's zone, which is UTC), and money reads "−$3.00", never "$-3". */

export const OPS_TZ = "Africa/Harare";

/** "13 Oct, 14:05" in Harare time. */
export function fmtDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: OPS_TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "13 Oct 2026" in Harare time. */
export function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: OPS_TZ, day: "numeric", month: "short", year: "numeric" });
}

/** "13 Oct" in Harare time. */
export function fmtDayMonth(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: OPS_TZ, day: "numeric", month: "short" });
}

/** "14:05" in Harare time. */
export function fmtTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: OPS_TZ, hour: "2-digit", minute: "2-digit" });
}

/** Compact "N min/hr/d ago". Server-rendered once; no hydration risk. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

/** "$1,234.50" / "−$3.00". Accepts the API's decimal strings. Null → "—". */
export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `−$${abs}` : `$${abs}`;
}

/** "#a1b2c3" — the first 6 characters of a UUID, for display. Links still carry the full id. */
export function shortId(id: string): string {
  return `#${id.replace(/-/g, "").slice(0, 6)}`;
}

/** "open_for_offers" → "Open for offers". */
export function enumLabel(v: string | null | undefined): string {
  if (!v) return "—";
  const s = v.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
