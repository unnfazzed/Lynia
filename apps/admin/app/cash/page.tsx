import { tokens } from "@lynia/shared";
import { adminFetch, adminFetchResult } from "../lib/api";
import type { CommissionRiderRow, CommissionOverview, MoneyDay, MoneyPanel, RiderRosterRow } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { IconBanknote } from "../components/icons";
import { SeedCreditCard } from "./SeedCreditCard";
import { fmtDateTime, money } from "../lib/format";
import { FilterNav } from "../components/FilterNav";
import { Pill } from "../components/StatusPill";
import { CashNav } from "./CashNav";
import { runIntegrityCheck } from "./actions";

/** `GET /admin/riders` hard-caps at this many rows (`AdminRidersService.listRiders` — `take: 100`).
 *  A full page means the roster is truncated, so anything counted off it is a floor. */
const ROSTER_PAGE_SIZE = 100;

/**
 * Commission (prepaid per-ride). The revenue model: riders pre-fund a commission account and each
 * completed job after their first 10 debits a percentage of the fare (a food job: its delivery fee; see
 * @lynia/shared `COMMISSION`). This page is a read-only view of job volume and the commission the
 * ledger actually charged. No weekly billing, record-payment,
 * refund-netting or overdue state (those were the old cash-settlement engine, now removed).
 *
 * NEW-2 (docs/KNOWN_BUGS.md): the prepaid wallet itself (balance, top-ups, the per-ride debit ledger)
 * SHIPPED 2026-07-15 (`apps/api/src/wallet/*`, docs/archive/plans/2026-rider-wallet-design.md) — this docstring
 * and the page copy below used to say it "is not built" / "is a later build", which went stale the day
 * it shipped. Only the RATE is still 0%; the wallet plumbing is live today.
 */
export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  // Admin console v2 §6: the platform money panel's range (7 or 30 Harare days).
  const days = sp.days === "30" ? 30 : 7;
  const res = await adminFetchResult<CommissionOverview>("/admin/cash/settlements");
  const view = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = view !== null;

  // Flip-day seed sizing. Best-effort and read-only: the seed card degrades to "roster unavailable"
  // rather than inventing a rider count for a card that quotes a dollar total.
  const roster = await adminFetch<RiderRosterRow[]>("/admin/riders");
  const eligibleCount = roster
    ? roster.filter((r) => r.accountStatus === "active" && !r.onHold && r.kycStatus === "verified").length
    : null;
  const rosterCapped = (roster?.length ?? 0) >= ROSTER_PAGE_SIZE;
  // UX20-02: three pieces of copy below used to hardcode the launch-era "still 0%" narrative regardless
  // of the live rate — once ops flips COMMISSION_RATE_PCT, they'd contradict the correctly-updating
  // headline/KPI on this same page. Gate on the live rate like those already do.
  const rateIsZero = view ? view.ratePct === 0 : true;
  // Best-effort: an older API without the panel just leaves the card saying so.
  const panel = await adminFetch<MoneyPanel>(`/admin/cash/money?days=${days}`);
  const rate = view ? `${view.ratePct}%` : "—";

  const columns: Column<CommissionRiderRow>[] = [
    {
      key: "name",
      header: "Biker",
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
    { key: "fares", header: "Fares delivered", className: "num", cell: (r) => money(r.fares) },
    {
      key: "commission",
      header: "Commission",
      className: "num",
      cell: (r) => <span style={{ fontWeight: 600 }}>{money(r.commission)}</span>,
    },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Commission</h1>
        <span className="sub">Prepaid per-ride — bikers pre-fund an account, commission is deducted per ride</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <CashNav active="/cash" />

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
              <b>Commission is {rate}.</b> Bikers keep the full fare; nothing is collected.
            </>
          ) : (
            <>
              <b>Commission is {rate}</b> per job, after each biker&apos;s first 10 free jobs. Food jobs are charged on
              the delivery fee.
            </>
          )}
        </span>
      </div>

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Commission rate" value={rate} hint="per job · first 10 free" />
        <KpiCard label="Rides" value={view ? view.kpis.rides : "—"} hint="completed, this period" />
        <KpiCard
          label="Fares delivered"
          value={view ? money(view.kpis.fares) : "—"}
          hint={rateIsZero ? "bikers keep this at 0%" : "before commission"}
        />
        <KpiCard label="Commission accrued" value={view ? money(view.kpis.commission) : "—"} hint="actually charged" />
      </section>

      <MoneyPanelCard panel={panel} days={days} connected={connected} />

      <section className="card">
        <div className="block-title">
          By biker
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
                line="Ride volume builds here as bikers complete deliveries."
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
            ? "Once the rate is on, each job after a biker's first 10 deducts its commission from their balance."
            : "Each job after a biker's first 10 deducts its commission from their balance. Food jobs: on the delivery fee."}
        </div>
      </section>

      {/* Kit cash.html:35-51 — flip-day bulk seed-credit. The apply action is unwired (no bulk endpoint
          exists); the card states that inline and keeps its trigger disabled. */}
      <SeedCreditCard eligibleCount={eligibleCount} rosterCapped={rosterCapped} />
    </main>
  );
}

const DRIFT_LABEL: Record<string, string> = {
  balance_mismatch: "balance ≠ ledger",
  missing_topup_credit: "top-up not credited",
  missing_receipt: "commission without rate",
  orphan_topup_credit: "credit on an unconfirmed top-up",
  free_job_nonzero: "free job not $0",
};

/**
 * Admin console v2 §6 — the platform money panel (undrawn; route (b), from the kit's card, KPI, chips and
 * table). By Harare day from the ledger; float and receivable are balances now; the ledger check is the
 * nightly integrity sweep, with Run now.
 */
function MoneyPanelCard({ panel, days, connected }: { panel: MoneyPanel | null; days: number; connected: boolean }) {
  const dayCols: Column<MoneyDay>[] = [
    { key: "day", header: "Day", className: "mono", cell: (d) => d.day },
    { key: "in", header: "Top-ups in", className: "num", cell: (d) => money(d.topupsIn) },
    { key: "fees", header: "Fees", className: "num", cell: (d) => money(d.fees) },
    { key: "commission", header: "Commission", className: "num", cell: (d) => money(d.commission) },
    { key: "manual", header: "Manual credits", className: "num", cell: (d) => money(d.manualCredits) },
    { key: "reversals", header: "Reversals", className: "num", cell: (d) => money(d.reversals) },
    { key: "free", header: "Free jobs", className: "num mut", cell: (d) => d.freeJobs },
  ];
  const check = panel?.integrity ?? null;
  const problems = check ? Object.entries(check.drift).filter(([, n]) => n > 0) : [];
  return (
    <section className="card" style={{ marginBottom: tokens.space.lg }}>
      <div className="block-title">
        Platform money
        <span className="right">
          by Harare day ·{" "}
          <a href={`/cash/money.csv?days=${days}`} style={{ color: tokens.color.accentText }}>
            CSV
          </a>
        </span>
      </div>
      <FilterNav
        items={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
        ]}
        active={String(days)}
        hrefFor={(v) => (v === "30" ? "/cash?days=30" : "/cash")}
      />
      {!panel ? (
        <EmptyState icon={<IconBanknote />} title="Money panel unavailable" line="The API didn't return it. Reload to try again." />
      ) : (
        <>
          <section className="panels" style={{ marginBottom: tokens.space.md }}>
            <KpiCard label="Top-ups in" value={money(panel.totals.topupsIn)} hint={`${days} days · Paynow`} size={22} />
            <KpiCard label="Fees" value={money(panel.totals.fees)} hint="paid on top of top-ups" size={22} />
            <KpiCard label="Commission" value={money(panel.totals.commission)} hint={`${panel.totals.freeJobs} free jobs`} size={22} />
            <KpiCard label="Manual credits" value={money(panel.totals.manualCredits)} hint={`reversals ${money(panel.totals.reversals)}`} size={22} />
            <KpiCard label="Float" value={money(panel.float)} hint="bikers' money we hold, now" size={22} />
            <KpiCard
              label="Receivable"
              value={money(panel.receivable)}
              hint={
                <a href="/cash/owed" style={{ color: tokens.color.accentText }}>
                  {panel.owedCount} bikers owe this →
                </a>
              }
              size={22}
            />
          </section>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: tokens.space.md, fontSize: 13 }}>
            {check ? (
              check.ok ? (
                <Pill kind="good">ledger check OK</Pill>
              ) : (
                <Pill kind="bad">ledger check: {check.totalDrift} problems</Pill>
              )
            ) : (
              <Pill kind="mut">ledger check not run yet</Pill>
            )}
            {check ? (
              <span style={{ color: tokens.color.muted }}>
                {check.accountsChecked} accounts · {fmtDateTime(check.at)}
                {problems.length ? ` · ${problems.map(([k, n]) => `${DRIFT_LABEL[k] ?? k} ${n}`).join(", ")}` : ""}
              </span>
            ) : null}
            <form action={runIntegrityCheck}>
              <button type="submit" className="btn ghost" disabled={!connected}>
                Run now
              </button>
            </form>
          </div>

          <DataTable columns={dayCols} rows={panel.rows} rowKey={(d) => d.day} />
        </>
      )}
    </section>
  );
}
