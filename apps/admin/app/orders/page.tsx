import { OrderStatus, tokens } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import { connOffLabel, reasonLine } from "../components/states";

interface Order {
  id: string;
  status: string;
  proposedFare: string;
  agreedFare: string | null;
  distanceKm: number | null;
  riderId: string | null;
  cancelledByRole: "rider" | "customer" | null;
  cancelReason: string | null;
  createdAt: string;
}

const STATUSES = Object.values(OrderStatus);
/* DS card: white surface floating on --surface via the soft ambient shadow (no visible border). */
const card = {
  background: tokens.color.bg,
  border: "none",
  borderRadius: tokens.radius.card,
  boxShadow: "var(--shadow-card)",
  padding: tokens.space.lg,
} as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).status;
  const active = typeof raw === "string" && (STATUSES as string[]).includes(raw) ? raw : "";
  const res = await adminFetchResult<Order[]>(`/admin/orders${active ? `?status=${active}` : ""}`);
  const orders = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: tokens.space.xl }}>
      <header style={{ display: "flex", alignItems: "center", gap: tokens.space.md, marginBottom: tokens.space.lg }}>
        <a href="/" style={{ color: tokens.color.muted, textDecoration: "none", fontSize: 14 }}>← Dashboard</a>
        {/* Dense-console page header sits on --text-h2 (20/700). */}
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Orders monitor</h1>
        <span style={{ marginLeft: "auto", fontSize: 12, color: orders ? tokens.color.accentText : tokens.color.muted }}>
          {orders ? "● live" : connOffLabel(reason)}
        </span>
      </header>

      <nav style={{ display: "flex", flexWrap: "wrap", gap: tokens.space.sm, marginBottom: tokens.space.lg }}>
        {["", ...STATUSES].map((s) => (
          <a
            key={s || "all"}
            href={s ? `/orders?status=${s}` : "/orders"}
            // DS selected state = accent wash + accent text, not a CTA fill. 32px pill is a
            // desktop pointer target; the 44px --target-min rule is mobile-first.
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 32,
              fontSize: 12,
              padding: "6px 14px",
              borderRadius: 999,
              textDecoration: "none",
              fontWeight: s === active ? 600 : 400,
              color: s === active ? tokens.color.accentText : tokens.color.muted,
              background: s === active ? tokens.color.accentWash : "transparent",
              border: `1px solid ${s === active ? tokens.color.accentText : tokens.color.line}`,
            }}
          >
            {(s || "all").replace(/_/g, " ")}
          </a>
        ))}
      </nav>

      <section style={card}>
        {orders && orders.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: tokens.color.muted, textAlign: "left" }}>
                <th style={{ padding: "8px 8px" }}>Order</th>
                <th style={{ padding: "8px 8px" }}>Status</th>
                <th style={{ padding: "8px 8px" }}>Fare</th>
                <th style={{ padding: "8px 8px" }}>Distance</th>
                <th style={{ padding: "8px 8px" }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} style={{ borderTop: `1px solid ${tokens.color.line}` }}>
                  <td style={{ padding: "8px 8px", fontFamily: "monospace" }}>
                    <a href={`/orders/${o.id}`} style={{ color: tokens.color.accentText, textDecoration: "none" }}>
                      {o.id.slice(0, 8)}
                    </a>
                  </td>
                  <td style={{ padding: "8px 8px" }}>{o.status}</td>
                  <td style={{ padding: "8px 8px", fontVariantNumeric: "tabular-nums" }}>${o.agreedFare ?? o.proposedFare}</td>
                  <td style={{ padding: "8px 8px", fontVariantNumeric: "tabular-nums" }}>{o.distanceKm != null ? `${o.distanceKm} km` : "—"}</td>
                  <td style={{ padding: "8px 8px", color: tokens.color.muted }}>
                    {o.cancelReason ? `cancelled${o.cancelledByRole ? ` (${o.cancelledByRole})` : ""}: ${o.cancelReason}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 14, color: tokens.color.muted }}>
            {orders ? "No orders in this view." : reasonLine(reason ?? "unconfigured", "orders")}
          </div>
        )}
      </section>
    </main>
  );
}
