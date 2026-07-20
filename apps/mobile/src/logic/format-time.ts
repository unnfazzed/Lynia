/**
 * Shared time formatters (roadmap 3.5) — extracted from app/rider/job.tsx (`fmtClock`) and
 * app/wallet/index.tsx (`fmtWhen`), which had duplicated the same locale time format. One home, so a
 * format tweak is one edit and both screens stay in step. Each guards an invalid date once and returns
 * "" (never "Invalid Date" on a terminal) — behaviour-preserving vs the former in-screen copies.
 */

/** Time-of-day only, e.g. "3:07 PM" — default locale. "" for an unparseable ISO string. */
export function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** Short date · time, e.g. "5 Jul · 3:07 PM" — default locale. "" for an unparseable ISO string. */
export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}
