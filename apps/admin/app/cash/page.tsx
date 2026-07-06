import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import type { CommissionRiderRow, CommissionOverview } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { IconBanknote } from "../components/icons";

/**
 * Commission (prepaid per-ride). The revenue model: riders pre-fund a commission account and each
 * completed ride debits a percentage of the amount paid (see @lynia/shared `COMMISSION`). The rate is
 * **0% for the launch period**, so nothing is collected yet — this page is a read-only view of ride
 * volume and the commission that would accrue at the current rate. No weekly billing, record-payment,
 * refund-netting or overdue state (those were the old cash-settlement engine, now removed); the
 * prepaid wallet + top-ups are a later build (docs/plans/2026-biker-prepaid-commission.md).
 */
export default async function CashPage() {
  const res = await adminFetchResult<CommissionOverview>("/admin/cash/settlements");
  const view = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = view !== null;
  const rate = view ? `${view.ratePct}%` : "—";

  const columns: Column<CommissionRiderRow>[] = [
    {
      key: "name",
      header: "Rider",
      cell: (r) => (
        <a
          href={r.riderId ? `/riders/${r.riderId}` : "/riders"}
          style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}
        >
          {r.name}
        </a>
      ),
    },
    { key: "rides", header: "Rides", className: "num", cell: (r) => r.rides },
    { key: "fares", header: "Fares delivered", className: "num", cell: (r) => `$${r.fares}` },
    {
      key: "commission",
      header: "Commission",
      className: "num",
      cell: (r) => <span style={{ fontWeight: 600 }}>${r.commission}</span>,
    },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Commission</h1>
        <span className="sub">Prepaid per-ride — riders pre-fund an account, commission is deducted per ride</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      {/* Launch-model marker — gold highlight as border/wash (never gold text). */}
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
          <b>Commission is {rate} during the launch period.</b> Riders keep the full agreed fare; nothing is
          collected yet. The prepaid wallet (top-ups and the per-ride deduction) is not built — the figures below
          are informational ride volume, not money owed.
        </span>
      </div>

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Commission rate" value={rate} hint="% of the amount paid, per ride" />
        <KpiCard label="Rides" value={view ? view.kpis.rides : "—"} hint="completed, this period" />
        <KpiCard label="Fares delivered" value={view ? `$${view.kpis.fares}` : "—"} hint="riders keep this at 0%" />
        <KpiCard label="Commission accrued" value={view ? `$${view.kpis.commission}` : "—"} hint="at the current rate" />
      </section>

      <section className="card">
        <div className="block-title">
          By rider
          <span className="right">{view ? view.periodLabel : "—"}</span>
        </div>
        <DataTable
          columns={columns}
          rows={view?.rows ?? []}
          rowKey={(r) => r.riderId}
          empty={
            connected ? (
              <EmptyState
                icon={<IconBanknote />}
                title="No rides yet this period"
                line="Ride volume builds here as riders complete deliveries."
              />
            ) : (
              <EmptyState
                icon={<IconBanknote />}
                title={reasonTitle(reason ?? "unconfigured", "Commission")}
                line={reasonLine(reason ?? "unconfigured", "commission")}
              />
            )
          }
        />
        <div style={{ fontSize: 12, color: tokens.color.muted, marginTop: 12 }}>
          Once the rate turns on, each completed ride will deduct its commission from the rider&apos;s pre-funded
          account; a low balance blocks going online until they top up. Balance, top-ups and the per-ride
          deduction ledger are a later build.
        </div>
      </section>
    </main>
  );
}
