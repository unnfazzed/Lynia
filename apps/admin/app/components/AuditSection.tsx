import { tokens } from "@lynia/shared";
import { adminFetch } from "../lib/api";
import type { AuditList, AuditRow } from "../lib/adminTypes";
import { enumLabel, fmtDateTime, money } from "../lib/format";
import { DataTable, type Column } from "./DataTable";
import { RecordLink } from "./links";
import { SubsectionUnavailable } from "./states";

/** "$5.00 · Safety report · went offline mid-job" — the amount, reason code and note, whichever exist. */
export function auditReason(r: Pick<AuditRow, "reasonCode" | "note" | "amount">): string {
  const parts = [r.amount ? money(r.amount) : null, r.reasonCode ? enumLabel(r.reasonCode) : null, r.note].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

/** Columns shared by the /audit viewer and the per-record Audit sections. `withTarget` adds the Target column. */
export function auditColumns(withTarget: boolean): Column<AuditRow>[] {
  const cols: Column<AuditRow>[] = [
    { key: "at", header: "When", className: "mut", cell: (r) => <span style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.at)}</span> },
    { key: "action", header: "Action", cell: (r) => <span title={r.action}>{r.actionLabel}</span> },
  ];
  if (withTarget) {
    cols.push({
      key: "target",
      header: "Target",
      cell: (r) => (r.target.href ? <RecordLink href={r.target.href}>{r.target.label}</RecordLink> : <span className="mut">{r.target.label}</span>),
    });
  }
  cols.push(
    { key: "actor", header: "By", cell: (r) => <RecordLink href={`/audit?actor=${encodeURIComponent(r.actor.id)}`}>{r.actor.name}</RecordLink> },
    { key: "reason", header: "Reason", className: "mut", cell: (r) => auditReason(r) },
  );
  return cols;
}

/** The newest audit rows targeting one record, for {@link AuditCard}. Null when unavailable. */
export function fetchAuditFor(target: string, limit = 5): Promise<AuditList | null> {
  return adminFetch<AuditList>(`/admin/audit?target=${encodeURIComponent(target)}&limit=${limit}`);
}

/**
 * The compact Audit section on a biker / customer / order / merchant page (admin console v2 §8): the newest rows
 * that target this record, and a link to the full viewer filtered to it.
 */
export function AuditCard({ target, list }: { target: string; list: AuditList | null }) {
  return (
    <section className="card" style={{ marginTop: tokens.space.lg }}>
      <div className="block-title">
        Audit
        <span className="right">
          <a href={`/audit?target=${encodeURIComponent(target)}`} style={{ color: tokens.color.accentText }}>
            All audit rows →
          </a>
        </span>
      </div>
      {!list ? (
        <SubsectionUnavailable noun="audit log" />
      ) : (
        <DataTable
          columns={auditColumns(false)}
          rows={list.rows}
          rowKey={(r) => r.id}
          empty={
            <div className="mut" style={{ textAlign: "center", padding: 20 }}>
              Nothing recorded yet.
            </div>
          }
        />
      )}
    </section>
  );
}
