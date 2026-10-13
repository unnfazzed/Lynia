import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import type { AuditList, AuditRow } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { FilterNav } from "../components/FilterNav";
import { auditColumns } from "../components/AuditSection";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { IconHistory } from "../components/icons";
import { AUDIT_TYPE_CHIPS, auditApiPath, auditHref, changeSummary, readAuditFilters } from "./filters";

/**
 * Audit viewer (admin console v2 §8, route (b) D-106): every recorded action, newest first, filtered by type chip,
 * target id, who did it, action and Harare days. Built from the kit's subnav chips, card and data table.
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const filters = readAuditFilters(sp);
  const cursor = typeof sp.cursor === "string" && sp.cursor.length <= 400 ? sp.cursor : undefined;
  const res = await adminFetchResult<AuditList>(auditApiPath(filters, cursor));
  const connected = "data" in res;
  const list = connected ? res.data : null;

  const columns: Column<AuditRow>[] = auditColumns(true);
  if (list?.rows.some((r) => changeSummary(r.before, r.after))) {
    columns.push({ key: "change", header: "Change", className: "mut", cell: (r) => changeSummary(r.before, r.after) ?? "—" });
  }
  const anyFilter = Object.keys(filters).length > 0;

  return (
    <main className="content">
      <header className="page">
        <h1>Audit</h1>
        <span className="sub">Who did what, newest first. Times in Harare.</span>
        <Conn connected={connected} reason={"reason" in res ? res.reason : undefined} />
      </header>
      {!connected ? <OfflineBanner reason={res.reason} /> : null}

      <FilterNav items={AUDIT_TYPE_CHIPS} active={filters.targetType ?? ""} hrefFor={(v) => auditHref({ ...filters, targetType: v || undefined })} />

      <section className="card">
        <form className="filter-form" action="/audit" method="get">
          {filters.targetType ? <input type="hidden" name="targetType" value={filters.targetType} /> : null}
          <label>
            Target id
            <input className="field-input mono" name="target" defaultValue={filters.target} placeholder="biker, order or merchant id" autoComplete="off" />
          </label>
          <label>
            By
            <input className="field-input" name="actor" defaultValue={filters.actor} placeholder="operator or id" autoComplete="off" />
          </label>
          <label>
            Action
            <input className="field-input mono" name="action" defaultValue={filters.action} placeholder="rider.suspend or rider." autoComplete="off" />
          </label>
          <label>
            From
            <input className="field-input" type="date" name="from" defaultValue={filters.from} />
          </label>
          <label>
            To
            <input className="field-input" type="date" name="to" defaultValue={filters.to} />
          </label>
          <span style={{ display: "flex", gap: tokens.space.sm }}>
            <button type="submit" className="btn solid">
              Apply
            </button>
            {anyFilter ? (
              <a className="btn quiet" href="/audit">
                Clear
              </a>
            ) : null}
          </span>
        </form>

        {connected ? (
          <DataTable
            columns={columns}
            rows={list?.rows ?? []}
            rowKey={(r) => r.id}
            empty={<EmptyState icon={<IconHistory />} title="No audit rows" line={anyFilter ? "Nothing matches these filters." : "Nothing recorded yet."} />}
          />
        ) : (
          <EmptyState icon={<IconHistory />} title={reasonTitle(res.reason, "Audit log")} line={reasonLine(res.reason, "the audit log")} />
        )}

        {list && (list.nextCursor || cursor) ? (
          <div className="list-foot">
            <span>50 rows a page.</span>
            <span style={{ display: "flex", gap: 12 }}>
              {cursor ? <a href={auditHref(filters)}>↺ Back to latest</a> : null}
              {list.nextCursor ? <a href={auditHref(filters, list.nextCursor)}>Older →</a> : null}
            </span>
          </div>
        ) : null}
      </section>
    </main>
  );
}
