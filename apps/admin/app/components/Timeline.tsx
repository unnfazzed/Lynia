import { tokens } from "@lynia/shared";
import { adminFetch } from "../lib/api";
import type { TimelineKind, TimelinePage, TimelineRow } from "../lib/adminTypes";
import { fmtDateTime } from "../lib/format";
import { DataTable, type Column } from "./DataTable";
import { RecordLink } from "./links";
import { SubsectionUnavailable } from "./states";
import { Pill } from "./StatusPill";

/** The pill each kind of row wears. */
export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  order: "Order",
  event: "Event",
  kyc: "ID check",
  audit: "Audit",
  topup: "Top-up",
  wallet: "Wallet",
};

export function timelineColumns(): Column<TimelineRow>[] {
  return [
    { key: "at", header: "When", className: "mut", cell: (r) => <span style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.at)}</span> },
    { key: "kind", header: "Kind", cell: (r) => <Pill kind={r.tone}>{TIMELINE_KIND_LABEL[r.kind] ?? r.kind}</Pill> },
    {
      key: "line",
      header: "What happened",
      cell: (r) => (
        <span>
          {r.line}
          {r.by ? <span className="mut"> · {r.by}</span> : null}
        </span>
      ),
    },
    { key: "ref", header: "Order", cell: (r) => (r.ref ? <RecordLink href={r.ref.href}>{r.ref.label}</RecordLink> : "—") },
  ];
}

/** Read one timeline page. `apiPath` is the route without a cursor (it may carry its own query). Null when unavailable. */
export function fetchTimeline(apiPath: string, cursor?: string): Promise<TimelinePage | null> {
  const sep = apiPath.includes("?") ? "&" : "?";
  return adminFetch<TimelinePage>(cursor ? `${apiPath}${sep}cursor=${encodeURIComponent(cursor)}` : apiPath);
}

/**
 * One merged, newest-first timeline (admin console v2 §4) on a biker, customer or merchant page. `page` is what
 * {@link fetchTimeline} returned (null = not available, shown like the wallet card's note); `cursor` is this page's
 * `?tlCursor=`; `pageHref` builds the "Older" link.
 */
export function TimelineCard({
  page,
  cursor,
  pageHref,
  resetHref,
}: {
  page: TimelinePage | null;
  cursor?: string;
  pageHref: (cursor: string) => string;
  resetHref: string;
}) {
  return (
    <section className="card" id="timeline" style={{ marginTop: tokens.space.lg }}>
      <div className="block-title">Timeline</div>
      {!page ? (
        <SubsectionUnavailable noun="timeline" />
      ) : (
        <DataTable
          columns={timelineColumns()}
          rows={page.rows}
          rowKey={(r) => r.key}
          empty={
            <div className="mut" style={{ textAlign: "center", padding: 20 }}>
              Nothing recorded yet.
            </div>
          }
        />
      )}
      {page && (page.nextCursor || cursor) ? (
        <div className="list-foot">
          <span>Newest first.</span>
          <span style={{ display: "flex", gap: 12 }}>
            {cursor ? <a href={`${resetHref}#timeline`}>↺ Back to latest</a> : null}
            {page.nextCursor ? <a href={`${pageHref(page.nextCursor)}#timeline`}>Older →</a> : null}
          </span>
        </div>
      ) : null}
    </section>
  );
}
