import { tokens } from "@lynia/shared";

/**
 * Monitor/support console (CONCEPT §4). Reads the API's /admin/overview (lane F). Configure
 * API_BASE_URL (+ an admin ADMIN_API_TOKEN) to show live data; falls back to a placeholder
 * state when the API is unreachable or unconfigured.
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
  recentOrders: Array<{ id: string; status: string; proposedFare: string; agreedFare: string | null; createdAt: string }>;
}

async function getOverview(): Promise<Overview | null> {
  const base = process.env.API_BASE_URL;
  if (!base) return null;
  const token = process.env.ADMIN_API_TOKEN;
  try {
    const res = await fetch(`${base}/admin/overview`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Overview;
  } catch {
    return null;
  }
}

/* DS card: white surface floating on --surface via the soft ambient shadow (no visible border). */
const card = {
  background: tokens.color.bg,
  border: "none",
  borderRadius: tokens.radius.card,
  boxShadow: "var(--shadow-card)",
  padding: tokens.space.lg,
} as const;

export default async function DashboardPage() {
  const data = await getOverview();

  const panels = [
    { label: "Live orders", value: data ? liveOrders(data.ordersByStatus) : "—", hint: "open_for_offers / assigned" },
    { label: "Riders online", value: data ? `${data.riders.online}/${data.riders.verified}` : "—", hint: "online / verified" },
    { label: "Offers per broadcast", value: data ? data.metrics.offersPerBroadcast : "—", hint: "pilot funnel (§8)" },
    { label: "Expiry rate", value: data ? `${data.metrics.expiryRatePct}%` : "—", hint: "broadcasts that drew no rider" },
  ];

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: tokens.space.xl }}>
      <header style={{ display: "flex", alignItems: "center", gap: tokens.space.md, marginBottom: tokens.space.xl }}>
        {/* 32px: the static mark's crease facets only resolve at ≥32px (brand crease rule). */}
        <img src="/brand/lyniago-mark.svg" alt="LyniaGo" width={32} height={32} style={{ display: "block" }} />
        {/* Dense-console page header sits on --text-h2 (20/700). */}
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>LyniaGo — operations</h1>
        <nav style={{ display: "flex", gap: tokens.space.md, marginLeft: tokens.space.lg }}>
          <a href="/riders" style={{ fontSize: 14, color: tokens.color.muted, textDecoration: "none" }}>Riders</a>
          <a href="/orders" style={{ fontSize: 14, color: tokens.color.muted, textDecoration: "none" }}>Orders</a>
        </nav>
        <span style={{ marginLeft: "auto", fontSize: 12, color: data ? tokens.color.accentText : tokens.color.muted }}>
          {data ? "● live" : "○ API not connected"}
        </span>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: tokens.space.lg }}>
        {panels.map((p) => (
          <div key={p.label} style={card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.muted }}>{p.label}</div>
            {/* --text-display (28); only 400/600/700 webfonts ship, so 700 is the max real weight. */}
            <div style={{ fontSize: 28, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{p.value}</div>
            <div style={{ fontSize: 12, color: tokens.color.muted }}>{p.hint}</div>
          </div>
        ))}
      </section>

      <section style={{ ...card, marginTop: tokens.space.xl }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: tokens.space.md }}>Recent orders</div>
        {data && data.recentOrders.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: tokens.color.muted, textAlign: "left" }}>
                <th style={{ padding: "8px 8px" }}>Order</th>
                <th style={{ padding: "8px 8px" }}>Status</th>
                <th style={{ padding: "8px 8px" }}>Fare</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id} style={{ borderTop: `1px solid ${tokens.color.line}` }}>
                  <td style={{ padding: "8px 8px", fontFamily: "monospace" }}>{o.id.slice(0, 8)}</td>
                  <td style={{ padding: "8px 8px" }}>{o.status}</td>
                  <td style={{ padding: "8px 8px", fontVariantNumeric: "tabular-nums" }}>${o.agreedFare ?? o.proposedFare}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 14, color: tokens.color.muted }}>
            {data ? "No orders yet." : "Set API_BASE_URL (and ADMIN_API_TOKEN) to show live data."}
          </div>
        )}
      </section>
    </main>
  );
}

function liveOrders(byStatus: Record<string, number>): number {
  return (byStatus.open_for_offers ?? 0) + (byStatus.assigned ?? 0);
}
