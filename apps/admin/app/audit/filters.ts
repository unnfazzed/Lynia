/** The /audit viewer's filters (admin console v2 §8): read from the URL, written back into links and the API path. */

export const AUDIT_FILTER_KEYS = ["target", "targetType", "actor", "action", "from", "to"] as const;
export type AuditFilterKey = (typeof AUDIT_FILTER_KEYS)[number];
export type AuditFilters = Partial<Record<AuditFilterKey, string>>;

/** The type chips. `""` = every type. */
export const AUDIT_TYPE_CHIPS = [
  { value: "", label: "All" },
  { value: "rider", label: "Bikers" },
  { value: "customer", label: "Customers" },
  { value: "order", label: "Orders" },
  { value: "merchant", label: "Merchants" },
  { value: "issue", label: "Issues" },
  { value: "sos", label: "SOS" },
];

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Keep only known, non-empty, bounded values (dates must be a plain YYYY-MM-DD from the date picker). */
export function readAuditFilters(sp: Record<string, string | string[] | undefined>): AuditFilters {
  const out: AuditFilters = {};
  for (const k of AUDIT_FILTER_KEYS) {
    const raw = sp[k];
    const v = (typeof raw === "string" ? raw : "").trim().slice(0, 200);
    if (!v) continue;
    if ((k === "from" || k === "to") && !DAY_RE.test(v)) continue;
    out[k] = v;
  }
  return out;
}

function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** A console link to the viewer with these filters (and optionally a page cursor). */
export function auditHref(f: AuditFilters, cursor?: string): string {
  return `/audit${qs({ ...f, cursor })}`;
}

/** The API path for these filters. */
export function auditApiPath(f: AuditFilters, cursor?: string): string {
  return `/admin/audit${qs({ ...f, cursor })}`;
}

/** "status: active → suspended" for the fields an action changed; null when it recorded no snapshot. */
export function changeSummary(before: unknown, after: unknown): string | null {
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  const b = obj(before);
  const a = obj(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  if (!keys.length) return null;
  const show = (v: unknown) => (v === undefined || v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return keys
    .slice(0, 6)
    .map((k) => `${k}: ${show(b[k])} → ${show(a[k])}`)
    .join("; ");
}
