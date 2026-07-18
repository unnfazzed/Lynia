import { tokens, REPORT_REASON_LABELS, type ReportReason } from "@lynia/shared";
import type { ReportEntry } from "../lib/adminTypes";
import { IconAlert } from "./icons";

/**
 * Conduct/safety reports visibility (A-05). Surfaces how many times a party (rider or customer) has
 * been reported, broken down by `ReportReason` via `REPORT_REASON_LABELS`, then the individual
 * entries. Renders a `dangerWash` callout only when there is at least one report — a party with a
 * clean record shows nothing (the caller keeps its own "no reports" copy). Server component: styling
 * reads `tokens` + reuses the `.warnbar` danger-wash treatment; no white on a bright accent.
 */
export function ReportsCallout({ reports, subject }: { reports?: ReportEntry[]; subject: "rider" | "customer" }) {
  // Defensive: only render for a real, non-empty array. The API surfaces a report *count* (a number)
  // on some detail shapes alongside the entry list; guarding on Array.isArray means a caller that
  // accidentally passes the count can never crash this server component (it just renders nothing).
  if (!Array.isArray(reports) || reports.length === 0) return null;

  // Count per reason so the headline reads "Unsafe behaviour ×2 · No-show ×1".
  const byReason = new Map<ReportReason, number>();
  for (const r of reports) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  const breakdown = Array.from(byReason.entries()).map(
    ([reason, n]) => `${REPORT_REASON_LABELS[reason] ?? reason}${n > 1 ? ` ×${n}` : ""}`,
  );
  const n = reports.length;

  return (
    <div className="warnbar" style={{ flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <IconAlert />
        <span className="t">
          <b>
            Reported {n} {n === 1 ? "time" : "times"}.
          </b>
          This {subject} has been reported for conduct or safety by the other party. {breakdown.join(" · ")}.
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, width: "100%" }}>
        {reports.map((r, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              padding: "8px 0",
              borderTop: `1px solid ${tokens.color.line}`,
              fontSize: 13,
              color: tokens.color.ink,
            }}
          >
            <span className="mut num" style={{ flex: "none", fontSize: 12 }}>
              {r.date}
            </span>
            <span style={{ flex: 1 }}>
              <b style={{ color: tokens.color.danger }}>{REPORT_REASON_LABELS[r.reason] ?? r.reason}</b>
              {r.by ? <span className="mut"> · by {r.by}</span> : null}
              {r.note ? <div className="mut" style={{ fontSize: 12, marginTop: 2 }}>{r.note}</div> : null}
            </span>
            {r.orderId ? (
              <a href={`/orders/${r.orderId}`} style={{ color: tokens.color.accentText, flex: "none", fontSize: 12 }}>
                order →
              </a>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
