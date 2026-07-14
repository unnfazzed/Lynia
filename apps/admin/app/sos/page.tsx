import { adminFetchResult } from "../lib/api";
import type { SosRow } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { Pill } from "../components/StatusPill";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { IconAlert, IconCheck } from "../components/icons";
import { AcknowledgeButton } from "./AcknowledgeButton";
import { SosAutoRefresh } from "./SosAutoRefresh";

/** SOS queue (DS13-05 — feed + acknowledgement). Emergency alerts raised on live trips, pending
 *  ones first (then newest first within each group) so an open alert can never scroll out of view
 *  behind already-acknowledged ones — SOS is visible to ops independently of push delivery. Rows
 *  deep-link to the order at /orders/[id]; a still-pending alert carries an Acknowledge action so
 *  ops can mark it handled. */

/** Format an ISO timestamp as the readable "13 Jul, 14:32" the console uses elsewhere. Includes the
 *  time (not just the date like the KYC page) because SOS urgency turns on minutes, not days. */
function raisedAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function SosPage() {
  const res = await adminFetchResult<SosRow[]>("/admin/sos");
  const rows = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = rows !== null;

  const columns: Column<SosRow>[] = [
    { key: "id", header: "SOS", className: "mono", cell: (s) => s.id },
    { key: "order", header: "Order", className: "mono", cell: (s) => s.orderId },
    {
      key: "by",
      header: "Raised by",
      cell: (s) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span className="mono">{s.raisedByProfileId}</span>
          <Pill>{s.raisedByRole}</Pill>
        </span>
      ),
    },
    {
      key: "loc",
      header: "Location",
      cell: (s) =>
        s.lat != null && s.lng != null ? (
          <a
            href={`https://www.google.com/maps?q=${s.lat},${s.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ position: "relative", zIndex: 2, color: "var(--accent-text)" }}
          >
            map
          </a>
        ) : (
          <span className="mut">—</span>
        ),
    },
    { key: "raised", header: "Raised at", className: "mut", cell: (s) => raisedAt(s.createdAt) },
    {
      key: "status",
      header: "Status",
      cell: (s) =>
        s.acknowledgedAt ? (
          <Pill kind="mut">acknowledged · {raisedAt(s.acknowledgedAt)}</Pill>
        ) : (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Pill kind="bad" dot>
              pending
            </Pill>
            {connected ? <AcknowledgeButton id={s.id} /> : null}
          </span>
        ),
    },
  ];

  return (
    <main className="content">
      {/* Poll the live feed while an operator keeps the safety desk open (server component fetches
          once per navigation otherwise). No-op visually — refreshes the rows in place. */}
      {connected ? <SosAutoRefresh /> : null}
      <header className="page">
        <h1>SOS</h1>
        <span className="sub">Emergency alerts raised on live trips</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <section className="card">
        <DataTable
          columns={columns}
          rows={rows ?? []}
          rowKey={(s) => s.id}
          getRowHref={(s) => `/orders/${s.orderId}`}
          rowLabel={(s) => `Open order ${s.orderId}`}
          empty={
            connected ? (
              <EmptyState
                icon={<IconCheck />}
                title="No SOS alerts"
                line="Nothing to respond to — alerts raised from a live trip land here the moment they fire."
              />
            ) : (
              <EmptyState
                icon={<IconAlert />}
                title={reasonTitle(reason ?? "unconfigured", "SOS feed")}
                line={reasonLine(reason ?? "unconfigured", "the SOS feed")}
              />
            )
          }
        />
      </section>
    </main>
  );
}
