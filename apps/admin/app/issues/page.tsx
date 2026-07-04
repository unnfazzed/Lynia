import { adminFetch } from "../lib/api";
import type { IssueRow } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { Pill } from "../components/StatusPill";
import { FilterNav } from "../components/FilterNav";
import { Conn, EmptyState, OfflineBanner } from "../components/states";
import { IconAlert, IconCheck } from "../components/icons";

/** Issues / disputes queue (kit `issues.html`). Reports from customers, recipients and riders, each
 *  carrying the order. Rows open the investigation view at /issues/[id]. */
const FILTERS = [
  { value: "all", label: "all" },
  { value: "open", label: "open" },
  { value: "investigating", label: "investigating" },
  { value: "resolved", label: "resolved" },
];

function issuePill(status: IssueRow["status"]) {
  const kind = status === "resolved" ? "mut" : status === "open" ? "bad" : "";
  return <Pill kind={kind}>{status}</Pill>;
}

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const raw = searchParams.status;
  const active = typeof raw === "string" && FILTERS.some((f) => f.value === raw) ? raw : "all";
  const query = active === "all" ? "" : `?status=${active}`;
  const issues = await adminFetch<IssueRow[]>(`/admin/issues${query}`);
  const connected = issues !== null;

  const columns: Column<IssueRow>[] = [
    { key: "id", header: "Issue", className: "mono", cell: (i) => i.id },
    { key: "type", header: "Type", cell: (i) => i.type },
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
        <Conn connected={connected} />
      </header>

      {!connected ? <OfflineBanner /> : null}

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
                title="Issue queue not connected"
                line="Set API_BASE_URL (and ADMIN_API_TOKEN) to show live disputes."
              />
            )
          }
        />
      </section>
    </main>
  );
}
