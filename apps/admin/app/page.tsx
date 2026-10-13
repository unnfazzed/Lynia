import { OrderStatus, STUCK_AFTER_MINUTES, tokens } from "@lynia/shared";
import { adminFetchResult } from "./lib/api";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "./components/states";
import { KpiCard } from "./components/KpiCard";
import { StatusPill } from "./components/StatusPill";
import { IconAlert, IconIdCard, IconCheck, IconInbox } from "./components/icons";
import { AutoRefresh } from "./components/AutoRefresh";
import { FilterNav } from "./components/FilterNav";
import { FunnelStrip } from "./components/FunnelStrip";
import type { FunnelKind, FunnelRange, FunnelView } from "./lib/adminTypes";
import { OrderLink } from "./components/links";
import { money, timeAgo } from "./lib/format";

/**
 * Monitor/support console overview (CONCEPT §4, kit `ui_kits/admin/index.html`). Reads /admin/overview.
 * Headline KPIs + a pilot-funnel strip + a "needs attention" queue (stuck order / open dispute / KYC
 * backlog) + recent orders, refreshed every 30s. Degrades to an honest offline/empty state when the API is
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

/** Admin console v2 §4: the three happy-path strips under the KPIs, for a chosen range of Harare days. */
const FUNNELS: Array<{ kind: FunnelKind; title: string }> = [
  { kind: "biker", title: "Bikers" },
  { kind: "customer", title: "Customers" },
  { kind: "merchant", title: "Merchants" },
];
const FUNNEL_RANGES: Array<{ value: FunnelRange; label: string }> = [
  { value: "today", label: "today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = (await searchParams) ?? {};
  const range: FunnelRange = FUNNEL_RANGES.some((r) => r.value === sp.range) ? (sp.range as FunnelRange) : "7d";
  const [res, ...funnelRes] = await Promise.all([
    adminFetchResult<Overview>("/admin/overview"),
    ...FUNNELS.map((f) => adminFetchResult<FunnelView>(`/admin/funnels?kind=${f.kind}&range=${range}`)),
  ]);
  const funnels = funnelRes.map((r) => ("data" in r ? r.data : null));
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
      {connected ? <AutoRefresh intervalMs={30_000} /> : null}

      {/* Headline KPIs — the two the design leads with (completed + fares today) sit beside live supply. */}
      <section className="panels" style={{ marginBottom: tokens.space.md }}>
        <KpiCard label="Live orders" value={data ? liveOrders(data.ordersByStatus) : "—"} hint="all types, not yet finished" />
        <KpiCard label="Bikers online" value={data ? `${data.riders.online}/${data.riders.verified}` : "—"} hint="online / verified" />
        <KpiCard
          label="Completed today"
          value={data ? data.today.completed : "—"}
          hint={data && data.today.completionRatePct != null ? `${data.today.completionRatePct}% completion rate` : "all types, Harare day"}
        />
        <KpiCard label="Fares today" value={data ? money(data.today.fares) : "—"} hint="parcel fares + food delivery fees" />
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

      {/* Admin console v2 §4: the three happy paths for the chosen range (D-106); each tile opens its stuck list. */}
      {funnels.some((f) => f && Array.isArray(f.steps)) ? (
        <section className="card" style={{ marginBottom: tokens.space.lg }} aria-label="Happy paths">
          <div className="block-title">
            Happy paths
            <a className="right" href={`/people?range=${range}`} style={{ color: tokens.color.accentText, textDecoration: "none", fontWeight: 600 }}>
              People →
            </a>
          </div>
          <FilterNav items={FUNNEL_RANGES} active={range} hrefFor={(v) => `/?range=${v}`} />
          {FUNNELS.map((f, i) => {
            const view = funnels[i];
            return (
              <div key={f.kind} className="funnel-group">
                <div className="funnel-head">
                  {f.title}
                  <span className="mut">{view ? `${view.cohort} signed up` : "not available"}</span>
                  <a href={`/people?kind=${f.kind}&range=${range}`}>Stuck lists</a>
                </div>
                {view && Array.isArray(view.steps) ? <FunnelStrip compact kind={f.kind} range={range} steps={view.steps} label={`${f.title} funnel`} /> : null}
              </div>
            );
          })}
        </section>
      ) : null}

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
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Biker</th>
                  <th>Fare</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o) => (
                  <tr key={o.id} className="rowlink">
                    <td>
                      <OrderLink id={o.id} />
                    </td>
                    <td>{o.route}</td>
                    <td>
                      <StatusPill status={o.status} />
                    </td>
                    <td className="mut">{o.rider ?? "—"}</td>
                    <td className="num">{money(o.agreedFare ?? o.proposedFare)}</td>
                    <td className="mut num">{timeAgo(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

/** Not yet finished: everything but the four end states. `requested` is a merchant order in the kitchen
 *  (or a parcel a tick before it broadcasts); `delivered` still awaits completion. */
const ENDED: string[] = [OrderStatus.COMPLETED, OrderStatus.CANCELLED, OrderStatus.EXPIRED, OrderStatus.UNDELIVERED];

function liveOrders(byStatus: Record<string, number>): number {
  return Object.entries(byStatus).reduce((sum, [s, n]) => (ENDED.includes(s) ? sum : sum + n), 0);
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
      detail: "a customer or biker is waiting on a resolution.",
      action: "Investigate",
      href: "/issues",
      icon: <IconAlert />,
    });
  }
  if (kycPending > 0) {
    rows.push({
      title: `${kycPending} biker${kycPending === 1 ? "" : "s"} waiting on KYC`,
      detail: "verification review is holding them off the road.",
      action: "Review queue",
      href: "/riders?kyc=pending",
      icon: <IconIdCard />,
    });
  }
  return rows;
}
