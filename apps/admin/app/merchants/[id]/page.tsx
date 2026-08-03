import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import type { MerchantDebtLedgerRow, MerchantDetail, TripRow } from "../../lib/adminTypes";
import { DataTable, type Column } from "../../components/DataTable";
import { KpiCard } from "../../components/KpiCard";
import { KeyValue } from "../../components/KeyValue";
import { StatusPill, Pill } from "../../components/StatusPill";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { IconStore } from "../../components/icons";

const DEBT_TYPE_LABEL: Record<MerchantDebtLedgerRow["type"], string> = {
  opened: "Debt opened",
  settled_cash: "Settled — cash returned",
  settled_goods: "Settled — goods returned",
  written_off: "Written off — rider suspended",
};

/** Merchant profile (X1): cash rule, pilot status, recent orders, and the full append-only
 *  collect-and-return debt-ledger trail (R-01/R-06/R-07) — the same evidence support needs to answer
 *  "why does this merchant show open debt". Read-only: there is no merchant-standing mutation (no
 *  `accountStatus` on Merchant) — cash-ban/suspension actions live on the customer (below) and rider
 *  (via the existing Riders console) records this debt ledger already produced. */
export default async function MerchantProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawDebtCursor = sp.debtCursor;
  // LC-D-T1: `debtCursor` pages further back past the first 30 entries via the "Load older" link below.
  const debtCursor = typeof rawDebtCursor === "string" ? rawDebtCursor : undefined;
  const res = await adminFetchResult<MerchantDetail>(
    `/admin/merchants/${id}${debtCursor ? `?debtCursor=${encodeURIComponent(debtCursor)}` : ""}`,
  );

  if (!("data" in res)) {
    const reason = res.reason;
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/merchants">
            ← Merchants
          </a>
          <h1 style={{ fontSize: 18 }}>Merchant profile</h1>
          <Conn connected={false} reason={reason} />
        </header>
        <OfflineBanner reason={reason} />
        <section className="card">
          <EmptyState icon={<IconStore />} title={reasonTitle(reason, "Profile")} line={reasonLine(reason, "this merchant")} />
        </section>
      </main>
    );
  }

  const m = res.data;
  const connected = true;

  const tripCols: Column<TripRow>[] = [
    { key: "id", header: "Order", className: "mono", cell: (t) => t.id.slice(0, 8) },
    { key: "route", header: "Route", cell: (t) => t.route },
    { key: "status", header: "Status", cell: (t) => <StatusPill status={t.status} /> },
    { key: "fare", header: "Total", className: "num", cell: (t) => `$${t.fare}` },
    { key: "when", header: "When", className: "mut", cell: (t) => t.when },
  ];

  const ledgerCols: Column<MerchantDebtLedgerRow>[] = [
    { key: "at", header: "When", className: "mut", cell: (l) => new Date(l.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
    { key: "type", header: "Type", cell: (l) => DEBT_TYPE_LABEL[l.type] ?? l.type },
    {
      key: "amount",
      header: "Amount",
      className: "num",
      cell: (l) => {
        const v = Number(l.amount);
        return <span style={{ color: v < 0 ? tokens.color.accentText : tokens.color.danger, fontWeight: 600 }}>{v < 0 ? "−" : "+"}${Math.abs(v).toFixed(2)}</span>;
      },
    },
    {
      key: "order",
      header: "Order",
      className: "mono mut",
      cell: (l) => (
        <a href={`/orders/${l.orderId}`} style={{ color: tokens.color.accentText }}>
          {l.orderId.slice(0, 8)}
        </a>
      ),
    },
    {
      key: "rider",
      header: "Rider",
      className: "mono mut",
      cell: (l) => (
        <a href={`/riders/${l.riderId}`} style={{ color: tokens.color.accentText }}>
          {l.riderId.slice(0, 8)}
        </a>
      ),
    },
    { key: "note", header: "Note", className: "mut", cell: (l) => l.note ?? "—" },
  ];

  return (
    <main className="content">
      <header className="page">
        <a className="back" href="/merchants">
          ← Merchants
        </a>
        <h1 style={{ fontSize: 18 }}>{m.name}</h1>
        <span style={{ display: "flex", gap: 6 }}>
          <Pill kind="mut">{m.cashRule === "collect_and_return" ? "collect & return" : "pay upfront"}</Pill>
          {m.pilotEnabled ? <Pill kind="good">pilot</Pill> : null}
        </span>
        <Conn connected={connected} />
      </header>

      {m.openDebtCount > 0 ? (
        <div className="warnbar">
          <IconStore />
          <span className="t">
            <b>${m.openDebtAmount} in open collect-and-return debt</b> across {m.openDebtCount} order
            {m.openDebtCount > 1 ? "s" : ""}. A rider owing this merchant takes no new jobs until it settles — see the
            ledger below for which rider and order.
          </span>
        </div>
      ) : null}

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Orders" value={m.orders} hint={`since ${m.joined}`} size={22} />
        <KpiCard
          label="Open debt"
          value={`$${m.openDebtAmount}`}
          hint={m.openDebtCount > 0 ? `${m.openDebtCount} unsettled` : "none owed"}
          size={22}
        />
        <KpiCard label="Cuisine" value={m.cuisineTags[0] ?? "—"} hint={m.cuisineTags.slice(1).join(", ") || "no tags"} size={22} />
      </section>

      <div className="detail-grid">
        <section className="card">
          <div className="block-title">Recent orders</div>
          <DataTable
            columns={tripCols}
            rows={m.trail}
            rowKey={(t) => t.id}
            getRowHref={(t) => `/orders/${t.id}`}
            empty={<div className="mut" style={{ textAlign: "center", padding: 20 }}>No orders yet.</div>}
          />
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">Details</div>
            <KeyValue
              rows={[
                { label: "Cash rule", value: m.cashRule === "collect_and_return" ? "Collect & return" : "Pay upfront" },
                { label: "Busy mode", value: m.busyMode ? "On (+10 min prep)" : "Off" },
                { label: "Joined", value: m.joined },
                ...(m.description ? [{ label: "Description", value: m.description }] : []),
              ]}
            />
          </section>
          <div style={{ fontSize: 11, color: tokens.color.muted }}>
            No standing action lives on the merchant itself — a rider who doesn&apos;t return owed cash is suspended
            from the <a href="/riders" style={{ color: tokens.color.accentText }}>Riders</a> console (the ledger
            row below names them); a customer who refuses to pay is cash-banned from their own{" "}
            <a href="/customers" style={{ color: tokens.color.accentText }}>Customers</a> profile.
          </div>
        </div>
      </div>

      <section className="card" style={{ marginTop: tokens.space.lg }}>
        <div className="block-title">
          Debt ledger ·{" "}
          <a href="/merchants/disputes" style={{ color: tokens.color.accentText, fontWeight: 400, fontSize: 12, textDecoration: "none" }}>
            support disputes queue →
          </a>
        </div>
        <DataTable
          columns={ledgerCols}
          rows={m.debtLedger}
          rowKey={(l) => l.id}
          empty={<div className="mut" style={{ textAlign: "center", padding: 20 }}>No debt activity — every collect-and-return order has been paid up front, or none has shipped yet.</div>}
        />
        {/* LC-D-T1: the ledger is paged server-side (30/page) — disclose it and link further back
            instead of silently truncating. `debtCursor` clears to reset to the newest page. */}
        {m.debtLedgerNextCursor || debtCursor ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: tokens.color.muted, marginTop: 12 }}>
            <span>Showing 30 entries per page.</span>
            <span style={{ display: "flex", gap: 12 }}>
              {debtCursor ? (
                <a href={`/merchants/${id}`} style={{ color: tokens.color.accentText }}>
                  ↺ Back to latest
                </a>
              ) : null}
              {m.debtLedgerNextCursor ? (
                <a href={`/merchants/${id}?debtCursor=${encodeURIComponent(m.debtLedgerNextCursor)}`} style={{ color: tokens.color.accentText }}>
                  Load older →
                </a>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>
    </main>
  );
}
