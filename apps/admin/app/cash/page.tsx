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
 * refund-netting or overdue state (those were the old cash-settlement engine, now removed).
 *
 * NEW-2 (docs/KNOWN_BUGS.md): the prepaid wallet itself (balance, top-ups, the per-ride debit ledger)
 * SHIPPED 2026-07-15 (`apps/api/src/wallet/*`, docs/plans/2026-rider-wallet-design.md) — this docstring
 * and the page copy below used to say it "is not built" / "is a later build", which went stale the day
 * it shipped. Only the RATE is still 0%; the wallet plumbing is live today.
 */
export default async function CashPage() {
  const res = await adminFetchResult<CommissionOverview>("/admin/cash/settlements");
  const view = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = view !== null;
  // UX20-02: three pieces of copy below used to hardcode the launch-era "still 0%" narrative regardless
  // of the live rate — once ops flips COMMISSION_RATE_PCT, they'd contradict the correctly-updating
  // headline/KPI on this same page. Gate on the live rate like those already do.
  const rateIsZero = view ? view.ratePct === 0 : true;
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
          {rateIsZero ? (
            <>
              <b>Commission is {rate} during the launch period.</b> Riders keep the full agreed fare; nothing is
              collected yet. The prepaid wallet (top-ups and the per-ride deduction) is live — the figures below
              are informational ride volume at 0%, not money owed.
            </>
          ) : (
            <>
              <b>Commission is {rate}.</b> The figures below reflect money actually being deducted from riders'
              prepaid balances, per completed ride.
            </>
          )}
        </span>
      </div>

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Commission rate" value={rate} hint="% of the amount paid, per ride" />
        <KpiCard label="Rides" value={view ? view.kpis.rides : "—"} hint="completed, this period" />
        <KpiCard
          label="Fares delivered"
          value={view ? `$${view.kpis.fares}` : "—"}
          hint={rateIsZero ? "riders keep this at 0%" : "before commission"}
        />
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
          {rateIsZero
            ? "Once the rate turns on, each completed ride will deduct its commission from the rider's pre-funded account; a low balance blocks going online until they top up. Balance, top-ups and the per-ride deduction ledger are already live — only the rate itself is still 0%."
            : "Each completed ride deducts its commission from the rider's pre-funded account; a low balance blocks going online until they top up."}
        </div>
      </section>
    </main>
  );
}
