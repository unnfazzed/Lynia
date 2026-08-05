import { STUCK_AFTER_MINUTES, tokens } from "@lynia/shared";
import { adminFetchResult } from "./lib/api";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "./components/states";
import { KpiCard } from "./components/KpiCard";
import { StatusPill } from "./components/StatusPill";
import { IconAlert, IconIdCard, IconBanknote, IconCheck, IconInbox } from "./components/icons";

/**
 * Monitor/support console overview (CONCEPT §4, kit `ui_kits/admin/index.html`). Reads /admin/overview.
 * Headline KPIs + a pilot-funnel strip + a "needs attention" queue (stuck order / open dispute / KYC
 * backlog / commission) + recent orders. Degrades to an honest offline/empty state when the API is
 * unconfigured, unreachable, or the endpoint hasn't shipped (the header + fallback copy name the case).
 */
interface Overview {
  ordersByStatus: Record<string, number>;
  riders: { total: number; online: number; verified: number };
  metrics: {
    totalBroadcasts: number;
    offersPerBroadcast: number;
    pctBroadcastsWithOffer: number;
    expiryRatePct: number;
  };
  today: { completed: number; completionRatePct: number | null; fares: string };
  attention: { kycPending: number; openIssues: number; stuckOrders: number; stuckOrderId: string | null };
  commissionRatePct: number;
  recentOrders: Array<{
    id: string;
    status: string;
    route: string;
    rider: string | null;
    proposedFare: string;
    agreedFare: string | null;
    createdAt: string;
  }>;
}

export default async function OverviewPage() {
  const res = await adminFetchResult<Overview>("/admin/overview");
  const data = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = data !== null;

  const attentionRows = data ? buildAttention(data) : [];

  return (
    <main className="content">
      <header className="page">
        <h1>Overview</h1>
        <span className="sub">Harare pilot · monitor &amp; support console</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      {/* Headline KPIs — the two the design leads with (completed + fares today) sit beside live supply. */}
      <section className="panels" style={{ marginBottom: tokens.space.md }}>
        <KpiCard label="Live orders" value={data ? liveOrders(data.ordersByStatus) : "—"} hint="open for offers + in delivery" />
        <KpiCard label="Riders online" value={data ? `${data.riders.online}/${data.riders.verified}` : "—"} hint="online / verified" />
        <KpiCard
          label="Completed today"
          value={data ? data.today.completed : "—"}
          hint={data && data.today.completionRatePct != null ? `${data.today.completionRatePct}% completion rate` : "delivered today"}
        />
        <KpiCard label="Fares today" value={data ? `$${data.today.fares}` : "—"} hint="agreed fares, all cash" />
      </section>

      {/* Secondary pilot-funnel strip. */}
      <section className="card substrip" style={{ marginBottom: tokens.space.lg }}>
        <span className="m"><b>{data ? data.metrics.offersPerBroadcast : "—"}</b>offers per broadcast</span>
        <span className="m"><b>{data ? `${data.metrics.expiryRatePct}%` : "—"}</b>expiry rate</span>
        <span className="m"><b>{data ? (data.ordersByStatus.cancelled ?? 0) : "—"}</b>cancelled</span>
        <span className="m"><b>{data ? data.attention.kycPending : "—"}</b>KYC pending</span>
        <span className="m"><b>{data ? data.attention.openIssues : "—"}</b>open disputes</span>
        <span className="m"><b>{data ? `${data.metrics.pctBroadcastsWithOffer}%` : "—"}</b>broadcasts with an offer</span>
      </section>

      {/* Needs-attention queue — the operational heart of the overview. */}
      {connected ? (
        <section className="card" style={{ marginBottom: tokens.space.lg }}>
          <div className="block-title">
            Needs attention {attentionRows.length > 0 ? <span className="count">{attentionRows.length}</span> : null}
          </div>
          {attentionRows.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {attentionRows.map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 0",
                    borderTop: i === 0 ? "none" : `1px solid ${tokens.color.line}`,
                    fontSize: 13,
                  }}
                >
                  <span style={{ display: "inline-flex", width: 18, height: 18, color: row.danger ? tokens.color.danger : tokens.color.muted }}>
                    {row.icon}
                  </span>
                  <span style={{ flex: 1 }}>
                    <b>{row.title}</b> — {row.detail}
                  </span>
                  <a className="btn ghost" href={row.href}>
                    {row.action}
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconCheck />}
              title="Nothing needs you right now"
              line="Stuck orders, disputes and KYC applications will surface here."
            />
          )}
        </section>
      ) : null}

      {/* Recent orders. */}
      <section className="card">
        <div className="block-title">
          Recent orders
          <a className="right" href="/orders" style={{ color: tokens.color.accentText, textDecoration: "none", fontWeight: 600 }}>
            All orders →
          </a>
        </div>
        {data && data.recentOrders.length > 0 ? (
          <table className="data">
            <thead>
              <tr>
                <th>Order</th>
                <th>Route</th>
                <th>Status</th>
                <th>Rider</th>
                <th>Fare</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id} className="rowlink">
                  <td className="mono">
                    <a href={`/orders/${o.id}`} style={{ color: tokens.color.accentText, textDecoration: "none" }}>
                      {o.id.slice(0, 8)}
                    </a>
                  </td>
                  <td>{o.route}</td>
                  <td>
                    <StatusPill status={o.status} />
                  </td>
                  <td className="mut">{o.rider ?? "—"}</td>
                  <td className="num">${o.agreedFare ?? o.proposedFare}</td>
                  <td className="mut num">{timeAgo(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : data ? (
          <EmptyState
            icon={<IconInbox />}
            title="No orders yet today"
            line="New broadcasts appear here as customers send them."
          />
        ) : (
          <EmptyState
            icon={<IconInbox />}
            title={reasonTitle(reason ?? "unconfigured", "Recent orders")}
            line={reasonLine(reason ?? "unconfigured", "recent orders")}
          />
        )}
      </section>
    </main>
  );
}

function liveOrders(byStatus: Record<string, number>): number {
  const inFlight = ["open_for_offers", "assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"];
  return inFlight.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
}

interface AttentionRow {
  title: string;
  detail: string;
  action: string;
  href: string;
  icon: React.ReactNode;
  danger?: boolean;
}

/** Compose the needs-attention queue from the overview's attention signals — only surface live problems. */
function buildAttention(data: Overview): AttentionRow[] {
  const rows: AttentionRow[] = [];
  const { stuckOrders, stuckOrderId, openIssues, kycPending } = data.attention;
  if (stuckOrders > 0) {
    rows.push({
      title: `${stuckOrders} order${stuckOrders === 1 ? "" : "s"} may be stuck`,
      // WD-028: sourced from the same STUCK_AFTER_MINUTES the API's stuck-order aggregate + per-order
      // detail badge derive their threshold from (admin.shared.ts) — this app can't import server-side
      // code directly, but the copy must still name the SAME number so it can't drift stale again.
      detail: `no status update in ${STUCK_AFTER_MINUTES}+ min while in delivery.`,
      action: "Review order",
      href: stuckOrderId ? `/orders/${stuckOrderId}` : "/orders",
      icon: <IconAlert />,
      danger: true,
    });
  }
  if (openIssues > 0) {
    rows.push({
      title: `${openIssues} open dispute${openIssues === 1 ? "" : "s"}`,
      detail: "a customer or rider is waiting on a resolution.",
      action: "Investigate",
      href: "/issues",
      icon: <IconAlert />,
    });
  }
  if (kycPending > 0) {
    rows.push({
      title: `${kycPending} rider${kycPending === 1 ? "" : "s"} waiting on KYC`,
      detail: "verification review is holding them off the road.",
      action: "Review queue",
      href: "/riders?kyc=pending",
      icon: <IconIdCard />,
    });
  }
  // UX20-02: this used to be a hardcoded "Commission is 0%" literal that could never reflect the real,
  // operator-flippable rate — an ops flip to a live rate kept this row insisting nothing was collected,
  // directly contradicted by the very next click into /cash. Read the live rate instead.
  rows.push(
    data.commissionRatePct > 0
      ? {
          title: `Commission is ${data.commissionRatePct}%`,
          detail: "being deducted per ride from riders' prepaid balance.",
          action: "View",
          href: "/cash",
          icon: <IconBanknote />,
        }
      : {
          title: "Commission is 0%",
          detail: "launch period — nothing is collected yet.",
          action: "View",
          href: "/cash",
          icon: <IconBanknote />,
        },
  );
  return rows;
}

/** Compact "N min ago" for the recent-orders Created column. Server-rendered once; no hydration risk. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} d ago`;
}
