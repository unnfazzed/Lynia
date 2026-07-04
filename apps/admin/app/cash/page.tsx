import { tokens } from "@lynia/shared";
import { adminFetch } from "../lib/api";
import { submitAdminAction } from "../actions/audit";
import { REASONS } from "../lib/reasons";
import type { SettlementRow, SettlementWeek } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Pill } from "../components/StatusPill";
import { ConfirmModal } from "../components/ConfirmModal";
import { Conn, EmptyState, OfflineBanner } from "../components/states";
import { IconBanknote } from "../components/icons";

/**
 * Cash & settlements (kit `cash.html`). Riders collect fares in cash; commission settles on a cycle.
 *
 * TODO(A-06): settlement model unconfirmed — product decision. The rate (kit assumes 15%), the cycle
 * (weekly, Friday), refund netting and the 7-day auto-pause are NOT confirmed by Product/Finance.
 * Every number rendered here comes from the API (`SettlementWeek`) — none are hard-coded as truth —
 * and the caveat banner below flags the whole model as an assumption until A-06 lands.
 */
function settPill(r: SettlementRow) {
  if (r.status === "settled") return <Pill kind="good">settled</Pill>;
  if (r.status === "overdue") return <Pill kind="bad">{r.note}</Pill>;
  if (r.status === "none") return <Pill kind="mut">—</Pill>;
  return <Pill kind="mut">{r.note}</Pill>;
}

export default async function CashPage() {
  const week = await adminFetch<SettlementWeek>("/admin/cash/settlements");
  const connected = week !== null;

  const columns: Column<SettlementRow>[] = [
    {
      key: "name",
      header: "Rider",
      cell: (r) => (
        <a href="/riders" style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>
          {r.name}
        </a>
      ),
    },
    { key: "trips", header: "Trips", className: "num", cell: (r) => r.trips },
    { key: "cash", header: "Cash collected", className: "num", cell: (r) => `$${r.cash}` },
    {
      key: "comm",
      header: "Commission",
      className: "num",
      cell: (r) => <span style={{ fontWeight: 600 }}>${r.commission}</span>,
    },
    {
      key: "adj",
      header: "Adjustments",
      className: "mut",
      cell: (r) => <span style={{ fontSize: 12 }}>{r.adjustment ?? "—"}</span>,
    },
    { key: "status", header: "Status", cell: (r) => settPill(r) },
    {
      key: "action",
      header: "",
      align: "right",
      cell: (r) =>
        r.status === "due" || r.status === "overdue" ? (
          <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
            <ConfirmModal
              action="cash.settle"
              target={r.name}
              path="/cash"
              triggerLabel="Record payment…"
              triggerVariant="ghost"
              disabled={!connected}
              title={`Record settlement — ${r.name}`}
              consequence={
                <span>
                  Commission owed: <b>${r.commission}</b>
                  {r.adjustment ? <span className="mut"> ({r.adjustment})</span> : null}. Confirm only after the money is
                  received.
                </span>
              }
              reasons={REASONS.cashSettle}
              confirmLabel="Mark settled"
            />
            {r.status === "overdue" ? (
              // Non-destructive nudge — still routed through the audit seam.
              <form action={submitAdminAction}>
                <input type="hidden" name="action" value="cash.remind" />
                <input type="hidden" name="target" value={r.name} />
                <input type="hidden" name="path" value="/cash" />
                <button type="submit" className="btn quiet" disabled={!connected}>
                  Remind
                </button>
              </form>
            ) : null}
          </span>
        ) : null,
    },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Cash &amp; settlements</h1>
        <span className="sub">Riders collect fares in cash — the commission settles on a cycle</span>
        <Conn connected={connected} />
      </header>

      {!connected ? <OfflineBanner /> : null}

      {/* A-06 assumption marker — gold highlight as border/wash (never gold text). */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "flex-start",
          background: tokens.color.highlightWash,
          border: `1px solid ${tokens.color.highlightBorder}`,
          borderRadius: 12,
          padding: "10px 14px",
          marginBottom: tokens.space.lg,
          fontSize: 13,
          color: tokens.color.highlightInk,
        }}
      >
        <span aria-hidden="true">⚠</span>
        <span>
          <b>Settlement model unconfirmed (A-06).</b> The commission rate, cycle, refund netting and auto-pause shown
          here are assumptions pending a Product/Finance decision — treat every figure as illustrative, not policy.
        </span>
      </div>

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Cash collected" value={week ? `$${week.kpis.cashCollected}` : "—"} hint="this week, rider-held" />
        <KpiCard label="Commission owed" value={week ? `$${week.kpis.commissionOwed}` : "—"} hint="assumed % of agreed fares" />
        <KpiCard label="Settled this week" value={week ? `$${week.kpis.settledThisWeek}` : "—"} hint="cash at agent + EcoCash" />
        <KpiCard
          label="Overdue"
          value={week ? week.kpis.overdueCount : "—"}
          hint={
            week && week.kpis.overdueNote ? (
              <span style={{ color: tokens.color.danger }}>{week.kpis.overdueNote}</span>
            ) : (
              "riders past settlement day"
            )
          }
        />
      </section>

      <section className="card">
        <div className="block-title">
          This week — by rider
          <span className="right">{week ? `${week.weekLabel} · settlement day ${week.settlementDay}` : "—"}</span>
        </div>
        <DataTable
          columns={columns}
          rows={week?.rows ?? []}
          rowKey={(r) => r.id}
          empty={
            connected ? (
              <EmptyState
                icon={<IconBanknote />}
                title="Nothing to settle"
                line="Commission builds here as riders complete cash trips."
              />
            ) : (
              <EmptyState
                icon={<IconBanknote />}
                title="Settlements not connected"
                line="Set API_BASE_URL (and ADMIN_API_TOKEN) to show live settlements."
              />
            )
          }
        />
        <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 12 }}>
          Refunds owed to customers are netted off a rider&apos;s commission before settlement. A settlement 7+ days
          overdue pauses the rider&apos;s account automatically.{" "}
          <span style={{ color: tokens.color.highlightInk }}>(both rules assumed — A-06)</span>
        </div>
      </section>
    </main>
  );
}
