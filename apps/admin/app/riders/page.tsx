import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import { connOffLabel, reasonLine } from "../components/states";
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
/* DS card: white surface floating on --surface via the soft ambient shadow (no visible border). */
const card = {
  background: tokens.color.bg,
  border: "none",
  borderRadius: tokens.radius.card,
  boxShadow: "var(--shadow-card)",
  padding: tokens.space.lg,
} as const;

export default async function RidersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).kyc;
  const active = typeof raw === "string" && (TABS as readonly string[]).includes(raw) ? raw : "pending";
  const query = active === "all" ? "" : `?kyc=${active}`;
  const res = await adminFetchResult<Rider[]>(`/admin/riders${query}`);
  const riders = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;

  return (
    <main style={{ maxWidth: 1040, margin: "0 auto", padding: tokens.space.xl }}>
      <header style={{ display: "flex", alignItems: "center", gap: tokens.space.md, marginBottom: tokens.space.lg }}>
        <a href="/" style={{ color: tokens.color.muted, textDecoration: "none", fontSize: 14 }}>← Dashboard</a>
        {/* Dense-console page header sits on --text-h2 (20/700). */}
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Riders — KYC review</h1>
        <span style={{ marginLeft: "auto", fontSize: 12, color: riders ? tokens.color.accentText : tokens.color.muted }}>
          {riders ? "● live" : connOffLabel(reason)}
        </span>
      </header>

      <nav style={{ display: "flex", gap: tokens.space.sm, marginBottom: tokens.space.lg }}>
        {TABS.map((t) => (
          <a
            key={t}
            href={`/riders?kyc=${t}`}
            // DS selected state = accent wash + accent text, not a CTA fill. 32px pill is a
            // desktop pointer target; the 44px --target-min rule is mobile-first.
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 32,
              fontSize: 12, // --text-label, matches the orders filter pills
              padding: "6px 14px",
              borderRadius: 999,
              textDecoration: "none",
              fontWeight: t === active ? 600 : 400,
              color: t === active ? tokens.color.accentText : tokens.color.muted,
              background: t === active ? tokens.color.accentWash : "transparent",
              border: `1px solid ${t === active ? tokens.color.accentText : tokens.color.line}`,
            }}
          >
            {t.replace(/_/g, " ")}
          </a>
        ))}
      </nav>

      <section style={card}>
        {riders && riders.length > 0 ? (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ color: tokens.color.muted, textAlign: "left" }}>
                <th style={{ padding: "8px 8px" }}>Rider</th>
                <th style={{ padding: "8px 8px" }}>Phone</th>
                <th style={{ padding: "8px 8px" }}>Bike</th>
                <th style={{ padding: "8px 8px" }}>KYC</th>
                <th style={{ padding: "8px 8px" }}>Trips / rating</th>
                <th style={{ padding: "8px 8px" }}>Flags</th>
                <th style={{ padding: "8px 8px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {riders.map((r) => (
                <tr key={r.profileId} style={{ borderTop: `1px solid ${tokens.color.line}` }}>
                  <td style={{ padding: "8px 8px" }}>
                    <a href={`/riders/${r.profileId}`} style={{ color: tokens.color.accentText, textDecoration: "none" }}>
                      {r.name || r.profileId.slice(0, 8)}
                    </a>
                  </td>
                  <td style={{ padding: "8px 8px", fontFamily: "monospace" }}>{r.phone}</td>
                  <td style={{ padding: "8px 8px" }}>{r.bikeReg}</td>
                  <td style={{ padding: "8px 8px" }}>{r.kycStatus}</td>
                  <td style={{ padding: "8px 8px", fontVariantNumeric: "tabular-nums" }}>
                    {r.tripsCount} / {r.ratingCount > 0 ? r.ratingAvg.toFixed(1) : "—"}
                  </td>
                  <td style={{ padding: "8px 8px", color: tokens.color.muted }}>
                    {[r.isOnline ? "online" : null, r.cancelStrikes > 0 ? `${r.cancelStrikes} strikes` : null, r.cooldownUntil ? "cooldown" : null].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td style={{ padding: "8px 8px" }}>
                    {r.kycStatus === "pending" ? (
                      <span style={{ display: "flex", gap: 6 }}>
                        <KycButton profileId={r.profileId} status="verified" label="Approve" variant="solid" />
                        {/* Decline needs a reason code (A-02) — route to the doc-review screen where the
                            reason-coded modal + document compare live, not a reason-less inline decline. */}
                        <a
                          href={`/riders/${r.profileId}/kyc`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            minHeight: 36,
                            fontSize: 12,
                            fontWeight: 600,
                            padding: "6px 14px",
                            borderRadius: 999,
                            border: `1px solid ${tokens.color.line}`,
                            color: tokens.color.muted,
                            textDecoration: "none",
                          }}
                        >
                          Review
                        </a>
                      </span>
                    ) : (
                      <a href={`/riders/${r.profileId}/kyc`} style={{ color: tokens.color.accentText, textDecoration: "none" }}>
                        Review
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 14, color: tokens.color.muted }}>
            {riders ? "No riders in this view." : reasonLine(reason ?? "unconfigured", "riders")}
          </div>
        )}
      </section>
    </main>
  );
}

/* DS pill buttons (radius 999): solid CTA fill for Approve, ghost outline for Decline. Kept
   compact (36px) as dense table actions on a desktop pointer surface — the 44px --target-min
   rule is mobile-first. */
function KycButton({ profileId, status, label, variant }: { profileId: string; status: "verified" | "failed"; label: string; variant: "solid" | "ghost" }) {
  const solid = variant === "solid";
  return (
    <form action={setKyc} style={{ display: "inline" }}>
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: 36,
          fontSize: 12,
          fontWeight: 600,
          padding: "6px 14px",
          borderRadius: 999,
          border: solid ? "none" : `1px solid ${tokens.color.line}`,
          background: solid ? tokens.color.cta : "transparent",
          color: solid ? tokens.color.onAccent : tokens.color.muted,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    </form>
  );
}
