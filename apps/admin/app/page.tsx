import { OrderStatus, tokens } from "@lynia/shared";

/**
 * Admin dashboard shell (CONCEPT §4: monitor orders & riders, support stuck orders — not a
 * dispatch console). Static shell for lane A; live data wires up in lane F.
 */
export default function DashboardPage() {
  const panels = [
    { key: "live", label: "Live orders", value: "—", hint: "open_for_offers / assigned" },
    { key: "riders", label: "Riders online", value: "—", hint: "in the launch corridor" },
    { key: "ttfo", label: "Time to first offer", value: "—", hint: "p50 (pilot metric)" },
    { key: "stuck", label: "Needs support", value: "—", hint: "expired / no-show / stuck" },
  ];

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: tokens.space.xl }}>
      <header style={{ display: "flex", alignItems: "center", gap: tokens.space.md, marginBottom: tokens.space.xl }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: tokens.color.accent,
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
          }}
        >
          L
        </span>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Lynia — operations</h1>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: tokens.space.lg,
        }}
      >
        {panels.map((p) => (
          <div
            key={p.key}
            style={{
              background: tokens.color.bg,
              border: `1px solid ${tokens.color.line}`,
              borderRadius: tokens.radius.card,
              padding: tokens.space.lg,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: tokens.color.muted }}>{p.label}</div>
            <div style={{ fontSize: 32, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{p.value}</div>
            <div style={{ fontSize: 12, color: tokens.color.muted }}>{p.hint}</div>
          </div>
        ))}
      </section>

      <p style={{ marginTop: tokens.space.xl, fontSize: 13, color: tokens.color.muted }}>
        Order lifecycle: <code>{Object.values(OrderStatus).join(" → ")}</code>
      </p>
    </main>
  );
}
