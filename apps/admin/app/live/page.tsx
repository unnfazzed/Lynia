import { adminFetchResult } from "../lib/api";
import type { Fleet, FleetRider, LiveOrderRow, LiveOrders } from "../lib/adminTypes";
import { AutoRefresh } from "../components/AutoRefresh";
import { DataTable, type Column } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { OrderLink, RecordLink } from "../components/links";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { Pill } from "../components/StatusPill";
import { IconBike, IconPackage } from "../components/icons";
import { fmtDateTime, fmtDuration, timeAgo } from "../lib/format";
import { FleetMap } from "./FleetMap";

/** How often the page re-reads while the tab is visible. */
const REFRESH_MS = 20_000;

const TYPE_LABEL: Record<string, string> = { parcel: "Parcel", merchant: "Food / shop" };

function SlaPill({ r }: { r: LiveOrderRow }) {
  if (r.breach === "breach") return <Pill kind="bad" dot>{`Over by ${fmtDuration(r.elapsedMs - r.limitMs)}`}</Pill>;
  if (r.breach === "warn") return <Pill kind="warn" dot>{`${fmtDuration(r.limitMs - r.elapsedMs)} left`}</Pill>;
  return <Pill kind="good">On time</Pill>;
}

/**
 * Admin console v2 §7 — Live (undrawn; route (b), D-106). The order monitor (every active order, its stage,
 * how long it has been there against the stage's limit, past the limit first) and the live map of bikers
 * online and active orders. Polled: the page refreshes itself every 20 s while the tab is open.
 */
export default async function LivePage() {
  const [ordersRes, fleetRes] = await Promise.all([adminFetchResult<LiveOrders>("/admin/live/orders"), adminFetchResult<Fleet>("/admin/live/fleet")]);
  const live = "data" in ordersRes ? ordersRes.data : null;
  const fleet = "data" in fleetRes ? fleetRes.data : null;
  const reason = "data" in ordersRes ? ("data" in fleetRes ? undefined : fleetRes.reason) : ordersRes.reason;
  const connected = live !== null;

  const orderColumns: Column<LiveOrderRow>[] = [
    { key: "order", header: "Order", cell: (r) => <OrderLink id={r.id} /> },
    { key: "type", header: "Type", className: "mut", cell: (r) => TYPE_LABEL[r.orderType] ?? r.orderType },
    { key: "stage", header: "Waiting on", cell: (r) => r.stageLabel },
    {
      key: "time",
      header: "In this step",
      className: "num",
      cell: (r) => (
        <span title={`Since ${fmtDateTime(r.stageStartedAt)}`}>
          {fmtDuration(r.elapsedMs)} <span className="mut">of {fmtDuration(r.limitMs)}</span>
        </span>
      ),
    },
    { key: "sla", header: "Limit", cell: (r) => <SlaPill r={r} /> },
    {
      key: "who",
      header: "Venue / biker",
      cell: (r) => (
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "2px 8px" }}>
          {r.merchant ? <RecordLink href={`/merchants/${r.merchant.id}`}>{r.merchant.name}</RecordLink> : null}
          {r.rider ? <RecordLink href={`/riders/${r.rider.id}`}>{r.rider.name}</RecordLink> : r.merchant ? null : <span className="mut">—</span>}
        </span>
      ),
    },
    { key: "customer", header: "Customer", cell: (r) => <RecordLink href={`/customers/${r.customer.id}`}>{r.customer.name}</RecordLink> },
  ];

  const riderColumns: Column<FleetRider>[] = [
    { key: "biker", header: "Biker", cell: (r) => <RecordLink href={`/riders/${r.riderId}`}>{r.name}</RecordLink> },
    { key: "job", header: "Job", cell: (r) => (r.orderId ? <OrderLink id={r.orderId} /> : <span className="mut">free</span>) },
    {
      key: "fix",
      header: "Last position",
      cell: (r) =>
        !r.position ? (
          <span className="mut">none yet</span>
        ) : (
          <Pill kind={r.position.fresh ? "good" : "mut"}>{r.position.at ? timeAgo(r.position.at) : "time unknown"}</Pill>
        ),
    },
  ];

  const ridersWithFix = fleet?.riders.filter((r) => r.position?.fresh).length ?? 0;

  return (
    <main className="content">
      {connected ? <AutoRefresh intervalMs={REFRESH_MS} /> : null}
      <header className="page">
        <h1>Live</h1>
        <span className="sub">Active orders and bikers online · refreshes every 20 s</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <div className="panels" style={{ marginBottom: "var(--space-lg)" }}>
        <KpiCard label="Active orders" value={live ? live.counts.total : "—"} />
        <KpiCard label="Past the time limit" value={live ? live.counts.breach : "—"} hint={live && live.counts.breach > 0 ? "Top of the list" : undefined} />
        <KpiCard label="Close to the limit" value={live ? live.counts.warn : "—"} />
        <KpiCard label="Bikers online" value={fleet ? fleet.riders.length : "—"} hint={fleet ? `${ridersWithFix} sent a position in the last 2 min` : undefined} />
      </div>

      <section className="card" style={{ marginBottom: "var(--space-lg)" }}>
        <div className="block-title">
          Orders
          <span className="right">{live ? `as of ${fmtDateTime(live.generatedAt)}` : "—"}</span>
        </div>
        <DataTable
          columns={orderColumns}
          rows={live?.rows ?? []}
          rowKey={(r) => r.id}
          getRowHref={(r) => `/orders/${r.id}`}
          rowLabel={(r) => `Order ${r.id}`}
          empty={
            connected ? (
              <EmptyState icon={<IconPackage />} title="No active orders" line="New orders show here as they come in." />
            ) : (
              <EmptyState icon={<IconPackage />} title={reasonTitle(reason ?? "unconfigured", "Live orders")} line={reasonLine(reason ?? "unconfigured", "live orders")} />
            )
          }
        />
      </section>

      <div className="detail-grid">
        <section className="card">
          <div className="block-title">
            Map
            <span className="right">Drawn to scale · no street map</span>
          </div>
          {fleet ? (
            <FleetMap fleet={fleet} />
          ) : (
            <EmptyState icon={<IconBike />} title={reasonTitle(reason ?? "unconfigured", "The map")} line={reasonLine(reason ?? "unconfigured", "positions")} />
          )}
        </section>
        <section className="card">
          <div className="block-title">
            Bikers online
            <span className="right">{fleet ? fleet.riders.length : "—"}</span>
          </div>
          <DataTable
            columns={riderColumns}
            rows={fleet?.riders ?? []}
            rowKey={(r) => r.riderId}
            empty={<EmptyState icon={<IconBike />} title="No bikers online" line="Bikers show here when they go online." />}
          />
        </section>
      </div>
    </main>
  );
}
