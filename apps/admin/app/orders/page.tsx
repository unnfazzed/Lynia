import { OrderStatus, tokens } from "@lynia/shared";
import { adminFetch } from "../lib/api";

interface Order {
  id: string;
  status: string;
  proposedFare: string;
  agreedFare: string | null;
  distanceKm: number | null;
  riderId: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
}

const STATUSES = Object.values(OrderStatus);
const card = {
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.line}`,
  borderRadius: tokens.radius.card,
  padding: tokens.space.lg,
} as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const raw = searchParams.status;
  const active = typeof raw === "string" && (STATUSES as string[]).includes(raw) ? raw : "";
  const orders = await adminFetch<Order[]>(`/admin/orders${active ? `?status=${active}` : ""}`);

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: tokens.space.xl }}>
      <header style={{ display: "flex", alignItems: "center", gap: tokens.space.md, marginBottom: tokens.space.lg }}>
        <a href="/" style={{ color: tokens.color.muted, textDecoration: "none", fontSize: 13 }}>← Dashboard</a>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Orders monitor</h1>
        <span style={{ marginLeft: "auto", fontSize: 12, color: orders ? tokens.color.accent : tokens.color.muted }}>
          {orders ? "● live" : "○ API not connected"}
        </span>
      </header>

      <nav style={{ display: "flex", flexWrap: "wrap", gap: tokens.space.sm, marginBottom: tokens.space.lg }}>
        {["", ...STATUSES].map((s) => (
          <a
            key={s || "all"}
            href={s ? `/orders?status=${s}` : "/orders"}
            style={{
              fontSize: 12,
              padding: "4px 10px",
              borderRadius: 999,
              textDecoration: "none",
              color: s === active ? "#fff" : tokens.color.muted,
              background: s === active ? tokens.color.accent : "transparent",
              border: `1px solid ${s === active ? tokens.color.accent : tokens.color.line}`,
            }}
          >
            {s || "all"}
          </a>
        ))}
      </nav>

      <section style={card}>
        {orders && orders.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: tokens.color.muted, textAlign: "left" }}>
                <th style={{ padding: "6px 4px" }}>Order</th>
                <th style={{ padding: "6px 4px" }}>Status</th>
                <th style={{ padding: "6px 4px" }}>Fare</th>
                <th style={{ padding: "6px 4px" }}>Distance</th>
                <th style={{ padding: "6px 4px" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderTop: `1px solid ${tokens.color.line}` }}>
                  <td style={{ padding: "6px 4px", fontFamily: "monospace" }}>{o.id.slice(0, 8)}</td>
                  <td style={{ padding: "6px 4px" }}>{o.status}</td>
                  <td style={{ padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>${o.agreedFare ?? o.proposedFare}</td>
                  <td style={{ padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>{o.distanceKm != null ? `${o.distanceKm} km` : "—"}</td>
                  <td style={{ padding: "6px 4px", color: tokens.color.muted }}>
                    {o.cancelReason ? `cancelled (${o.cancelledBy === o.riderId ? "rider" : "customer"}): ${o.cancelReason}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 13, color: tokens.color.muted }}>
            {orders ? "No orders in this view." : "Set API_BASE_URL (and ADMIN_API_TOKEN) to show live data."}
          </div>
        )}
      </section>
    </main>
  );
}
