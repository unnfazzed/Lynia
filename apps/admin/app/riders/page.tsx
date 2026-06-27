import { tokens } from "@lynia/shared";
import { adminFetch } from "../lib/api";
import { setKyc } from "./actions";

interface Rider {
  profileId: string;
  name: string;
  phone: string;
  bikeReg: string;
  kycStatus: "pending" | "verified" | "failed";
  idVerified: boolean;
  isOnline: boolean;
  ratingAvg: number;
  ratingCount: number;
  tripsCount: number;
  cancelStrikes: number;
  cooldownUntil: string | null;
}

const TABS = ["pending", "verified", "failed", "all"] as const;
const card = {
  background: tokens.color.bg,
  border: `1px solid ${tokens.color.line}`,
  borderRadius: tokens.radius.card,
  padding: tokens.space.lg,
} as const;

export default async function RidersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const raw = searchParams.kyc;
  const active = typeof raw === "string" && (TABS as readonly string[]).includes(raw) ? raw : "pending";
  const query = active === "all" ? "" : `?kyc=${active}`;
  const riders = await adminFetch<Rider[]>(`/admin/riders${query}`);

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: tokens.space.xl }}>
      <header style={{ display: "flex", alignItems: "center", gap: tokens.space.md, marginBottom: tokens.space.lg }}>
        <a href="/" style={{ color: tokens.color.muted, textDecoration: "none", fontSize: 13 }}>← Dashboard</a>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Riders — KYC review</h1>
        <span style={{ marginLeft: "auto", fontSize: 12, color: riders ? tokens.color.accent : tokens.color.muted }}>
          {riders ? "● live" : "○ API not connected"}
        </span>
      </header>

      <nav style={{ display: "flex", gap: tokens.space.sm, marginBottom: tokens.space.lg }}>
        {TABS.map((t) => (
          <a
            key={t}
            href={`/riders?kyc=${t}`}
            style={{
              fontSize: 13,
              padding: "4px 10px",
              borderRadius: 999,
              textDecoration: "none",
              color: t === active ? tokens.color.onAccent : tokens.color.muted,
              background: t === active ? tokens.color.accent : "transparent",
              border: `1px solid ${t === active ? tokens.color.accent : tokens.color.line}`,
            }}
          >
            {t}
          </a>
        ))}
      </nav>

      <section style={card}>
        {riders && riders.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ color: tokens.color.muted, textAlign: "left" }}>
                <th style={{ padding: "6px 4px" }}>Rider</th>
                <th style={{ padding: "6px 4px" }}>Phone</th>
                <th style={{ padding: "6px 4px" }}>Bike</th>
                <th style={{ padding: "6px 4px" }}>KYC</th>
                <th style={{ padding: "6px 4px" }}>Trips / rating</th>
                <th style={{ padding: "6px 4px" }}>Flags</th>
                <th style={{ padding: "6px 4px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.profileId} style={{ borderTop: `1px solid ${tokens.color.line}` }}>
                  <td style={{ padding: "6px 4px" }}>{r.name || r.profileId.slice(0, 8)}</td>
                  <td style={{ padding: "6px 4px", fontFamily: "monospace" }}>{r.phone}</td>
                  <td style={{ padding: "6px 4px" }}>{r.bikeReg}</td>
                  <td style={{ padding: "6px 4px" }}>{r.kycStatus}</td>
                  <td style={{ padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>
                    {r.tripsCount} / {r.ratingCount > 0 ? r.ratingAvg.toFixed(1) : "—"}
                  </td>
                  <td style={{ padding: "6px 4px", color: tokens.color.muted }}>
                    {[r.isOnline ? "online" : null, r.cancelStrikes > 0 ? `${r.cancelStrikes} strikes` : null, r.cooldownUntil ? "cooldown" : null].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td style={{ padding: "6px 4px" }}>
                    {r.kycStatus === "pending" ? (
                      <span style={{ display: "flex", gap: 6 }}>
                        <KycButton profileId={r.profileId} status="verified" label="Approve" color={tokens.color.accent} />
                        <KycButton profileId={r.profileId} status="failed" label="Decline" color={tokens.color.muted} />
                      </span>
                    ) : (
                      <span style={{ color: tokens.color.muted }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 13, color: tokens.color.muted }}>
            {riders ? "No riders in this view." : "Set API_BASE_URL (and ADMIN_API_TOKEN) to show live data."}
          </div>
        )}
      </section>
    </main>
  );
}

function KycButton({ profileId, status, label, color }: { profileId: string; status: "verified" | "failed"; label: string; color: string }) {
  return (
    <form action={setKyc} style={{ display: "inline" }}>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, border: `1px solid ${color}`, background: "transparent", color, cursor: "pointer" }}
      >
        {label}
      </button>
    </form>
  );
}
