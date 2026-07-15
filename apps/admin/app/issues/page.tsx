import { ISSUE_TYPE_LABELS } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import type { IssueRow } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { Pill } from "../components/StatusPill";
import { FilterNav } from "../components/FilterNav";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { IconAlert, IconCheck } from "../components/icons";

/** Issues / disputes queue (kit `issues.html`). Reports from customers, recipients and riders, each
 *  carrying the order. Rows open the investigation view at /issues/[id]. */
const FILTERS = [
  { value: "all", label: "all" },
  { value: "open", label: "open" },
  { value: "investigating", label: "investigating" },
  { value: "resolved", label: "resolved" },
];

/** Status pill: open/investigating stay active (neutral fill), resolved goes muted. Never `bad` —
 *  an open dispute isn't a failure state, it's work in the queue. */
function issuePill(status: IssueRow["status"]) {
  return <Pill kind={status === "resolved" ? "mut" : ""}>{status}</Pill>;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).status;
  const active = typeof raw === "string" && FILTERS.some((f) => f.value === raw) ? raw : "all";
  const query = active === "all" ? "" : `?status=${active}`;
  const res = await adminFetchResult<IssueRow[]>(`/admin/issues${query}`);
  const issues = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = issues !== null;

  const columns: Column<IssueRow>[] = [
    { key: "id", header: "Issue", className: "mono", cell: (i) => i.id },
    { key: "type", header: "Type", cell: (i) => <Pill>{ISSUE_TYPE_LABELS[i.type] ?? i.type}</Pill> },
    { key: "order", header: "Order", className: "mono", cell: (i) => i.order },
    { key: "by", header: "Opened by", cell: (i) => i.openedBy },
    { key: "opened", header: "Opened", className: "mut", cell: (i) => i.opened },
    { key: "status", header: "Status", cell: (i) => issuePill(i.status) },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Issues</h1>
        <span className="sub">Disputes and reports from customers, recipients and riders</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <FilterNav items={FILTERS} active={active} hrefFor={(v) => (v === "all" ? "/issues" : `/issues?status=${v}`)} />

      <section className="card">
        <DataTable
          columns={columns}
          rows={issues ?? []}
          rowKey={(i) => i.id}
          getRowHref={(i) => `/issues/${i.id}`}
          rowLabel={(i) => `Investigate ${i.id}`}
          empty={
            connected ? (
              <EmptyState
                icon={<IconCheck />}
                title="No open issues"
                line="Disputes opened from the app land here with the order attached."
              />
            ) : (
              <EmptyState
                icon={<IconAlert />}
                title={reasonTitle(reason ?? "unconfigured", "Issue queue")}
                line={reasonLine(reason ?? "unconfigured", "the dispute queue")}
              />
            )
          }
        />
        {/* The list is capped server-side (take: 200); without this note a full page reads as "that's
            all there is" when older rows are simply not fetched — mirrors orders/page.tsx and
            riders/page.tsx, which already carry the same disclosure (UX-2026-07-15). */}
        {issues && issues.length >= 200 ? (
          <div className="mut" style={{ fontSize: 12, marginTop: 16 }}>
            Showing the latest 200 issues — older issues aren&apos;t listed. Filter by status to narrow the view.
          </div>
        ) : null}
      </section>
    </main>
  );
}
