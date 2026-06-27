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

const card = {
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.line}`,
  borderRadius: tokens.radius.card,
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
        <span style={{ width: 28, height: 28, borderRadius: 8, background: tokens.color.accent, color: tokens.color.onAccent, display: "grid", placeItems: "center", fontWeight: 800 }}>L</span>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Lynia — operations</h1>
        <nav style={{ display: "flex", gap: tokens.space.md, marginLeft: tokens.space.lg }}>
          <a href="/riders" style={{ fontSize: 13, color: tokens.color.muted, textDecoration: "none" }}>Riders</a>
          <a href="/orders" style={{ fontSize: 13, color: tokens.color.muted, textDecoration: "none" }}>Orders</a>
        </nav>
        <span style={{ marginLeft: "auto", fontSize: 12, color: data ? tokens.color.accent : tokens.color.muted }}>
          {data ? "● live" : "○ API not connected"}
        </span>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: tokens.space.lg }}>
        {panels.map((p) => (
          <div key={p.label} style={card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.muted }}>{p.label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{p.value}</div>
            <div style={{ fontSize: 12, color: tokens.color.muted }}>{p.hint}</div>
          </div>
        ))}
      </section>

      <section style={{ ...card, marginTop: tokens.space.xl }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: tokens.space.md }}>Recent orders</div>
        {data && data.recentOrders.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: tokens.color.muted, textAlign: "left" }}>
                <th style={{ padding: "6px 4px" }}>Order</th>
                <th style={{ padding: "6px 4px" }}>Status</th>
                <th style={{ padding: "6px 4px" }}>Fare</th>
              </tr>
            </thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id} style={{ borderTop: `1px solid ${tokens.color.line}` }}>
                  <td style={{ padding: "6px 4px", fontFamily: "monospace" }}>{o.id.slice(0, 8)}</td>
                  <td style={{ padding: "6px 4px" }}>{o.status}</td>
                  <td style={{ padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>${o.agreedFare ?? o.proposedFare}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 13, color: tokens.color.muted }}>
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
