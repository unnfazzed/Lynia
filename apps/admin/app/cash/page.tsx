import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import { submitAdminAction } from "../actions/audit";
import type { SettlementRow, SettlementWeek } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Pill } from "../components/StatusPill";
import { RecordPayment } from "./RecordPayment";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { IconBanknote } from "../components/icons";

/**
 * Cash & settlements (kit `cash.html`). Riders collect fares in cash; commission settles on a cycle.
 *
 * TODO(A-06): settlement model unconfirmed — product decision. The rate (kit assumes 15%), the cycle
 * (weekly, Friday), refund netting and the 7-day auto-pause are NOT confirmed by Product/Finance.
 * Every number rendered here comes from the API (`SettlementWeek`) — none are hard-coded as truth —
 * and the caveat banner below flags the whole model as an assumption until A-06 lands.
 */
/** Canonical SettlementStatus → pill. `overdue` lands in dangerWash (the `bad` pill); `paid` in the
 *  accent wash (`good`); `pending` stays neutral. */
function settPill(r: SettlementRow) {
  if (r.status === "paid") return <Pill kind="good">paid</Pill>;
  if (r.status === "overdue") return <Pill kind="bad">overdue</Pill>;
  return <Pill kind="mut">pending</Pill>;
}

export default async function CashPage() {
  const res = await adminFetchResult<SettlementWeek>("/admin/cash/settlements");
  const week = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = week !== null;

  const columns: Column<SettlementRow>[] = [
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
    { key: "gross", header: "Gross fares", className: "num", cell: (r) => `$${r.grossFares}` },
    {
      key: "comm",
      header: "Commission",
      className: "num",
      cell: (r) => <span style={{ fontWeight: 600 }}>${r.commission}</span>,
    },
    {
      key: "refunds",
      header: "Refunds netted",
      className: "num mut",
      cell: (r) =>
        r.refundsNetted && r.refundsNetted !== "0" ? (
          <span style={{ fontSize: 12 }}>−${r.refundsNetted}</span>
        ) : (
          <span style={{ fontSize: 12 }}>—</span>
        ),
    },
    {
      key: "due",
      header: "Amount due",
      className: "num",
      cell: (r) => <span style={{ fontWeight: 600 }}>${r.amountDue}</span>,
    },
    { key: "status", header: "Status", cell: (r) => settPill(r) },
    {
      key: "dueDate",
      header: "Due",
      className: "mut",
      cell: (r) => (
        <span style={{ fontSize: 12, color: r.status === "overdue" ? tokens.color.danger : undefined }}>
          {r.dueDate}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      align: "right",
      cell: (r) =>
        r.status !== "paid" ? (
          <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
            <RecordPayment
              id={r.id}
              name={r.name}
              amountDue={r.amountDue}
              refundsNetted={r.refundsNetted}
              connected={connected}
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
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

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
                title={reasonTitle(reason ?? "unconfigured", "Settlements")}
                line={reasonLine(reason ?? "unconfigured", "settlements")}
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
