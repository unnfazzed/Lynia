import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import type { FoodDisputes, HandshakeDisputeRow, RefundOverdueRow } from "../../lib/adminTypes";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { DataTable, type Column } from "../../components/DataTable";
import { Pill } from "../../components/StatusPill";
import { IconAlert } from "../../components/icons";
import { ResolveHandshakeButton } from "../ResolveHandshakeButton";

/** Support dispute queue (X1): R-05 frozen doorstep handshakes needing a resolve decision, plus N-12
 *  refund-overdue visibility (Q6 mocked default — escalation is visibility only; LyniaGo never holds
 *  the money, so there is no "pay the refund" button here, only the overdue flag support acts on
 *  off-console). */
export default async function FoodDisputesPage() {
  const res = await adminFetchResult<FoodDisputes>("/admin/merchant-disputes");
  const disputes = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = disputes !== null;

  const handshakeCols: Column<HandshakeDisputeRow>[] = [
    { key: "order", header: "Order", className: "mono", cell: (d) => d.orderId.slice(0, 8) },
    { key: "merchant", header: "Merchant", cell: (d) => d.merchant },
    { key: "customer", header: "Customer", className: "mut", cell: (d) => d.customer },
    { key: "rider", header: "Rider", className: "mut", cell: (d) => d.rider ?? "—" },
    { key: "amount", header: "Amount", className: "num", cell: (d) => (d.amount ? `$${d.amount}` : "—") },
    {
      key: "frozenAt",
      header: "Frozen since",
      className: "mut",
      cell: (d) => new Date(d.frozenAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
    },
    { key: "actions", header: "", cell: (d) => <ResolveHandshakeButton orderId={d.orderId} connected={connected} /> },
  ];

  const refundCols: Column<RefundOverdueRow>[] = [
    { key: "order", header: "Order", className: "mono", cell: (d) => d.orderId.slice(0, 8) },
    { key: "merchant", header: "Merchant", cell: (d) => d.merchant },
    { key: "customer", header: "Customer", className: "mut", cell: (d) => d.customer },
    { key: "amount", header: "Owed", className: "num", cell: (d) => (d.amount ? `$${d.amount}` : "—") },
    {
      key: "overdue",
      header: "Status",
      cell: (d) =>
        d.overdue ? (
          <Pill kind="bad">overdue · {Math.round(d.overdueMinutes / 60)}h</Pill>
        ) : (
          <Pill kind="mut">{d.overdueMinutes}m — within SLA</Pill>
        ),
    },
    {
      key: "orderLink",
      header: "",
      cell: (d) => (
        <a href={`/orders/${d.orderId}`} style={{ color: tokens.color.accentText, fontSize: 12 }}>
          Open order →
        </a>
      ),
    },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Food disputes</h1>
        <span className="sub">R-05 frozen doorstep handshakes and N-12 refund-overdue orders</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <div className="subnav">
        <a href="/merchants">merchants</a>
        <a href="/merchants/disputes" aria-current="page">
          disputes needing support
        </a>
      </div>

      <section className="card" style={{ marginBottom: tokens.space.lg }}>
        <div className="block-title">Frozen payment handshakes</div>
        <div style={{ fontSize: 12, color: tokens.color.muted, marginBottom: 10 }}>
          The customer confirmed paying cash at the door but the rider didn&apos;t confirm within the 2:00 window (or
          disputed it) — the rider takes no new jobs and the customer&apos;s delivery code stays masked until this is
          resolved.
        </div>
        <DataTable
          columns={handshakeCols}
          rows={disputes?.handshakeDisputes ?? []}
          rowKey={(d) => d.orderId}
          empty={
            connected ? (
              <EmptyState icon={<IconAlert />} title="No frozen handshakes" line="Nothing needs a dispute resolution right now." />
            ) : (
              <EmptyState icon={<IconAlert />} title={reasonTitle(reason ?? "unconfigured", "Disputes")} line={reasonLine(reason ?? "unconfigured", "disputes")} />
            )
          }
        />
      </section>

      <section className="card">
        <div className="block-title">Refunds past SLA</div>
        <div style={{ fontSize: 12, color: tokens.color.muted, marginBottom: 10 }}>
          A wallet-paid order that ended without a refund on record — LyniaGo never holds the customer&apos;s money
          (it pays the merchant&apos;s own rail directly), so this is a visibility flag for support to chase, not an
          automated payout.
        </div>
        <DataTable
          columns={refundCols}
          rows={disputes?.refundsOverdue ?? []}
          rowKey={(d) => d.orderId}
          empty={
            connected ? (
              <EmptyState icon={<IconAlert />} title="No refunds pending" line="Every failed wallet-paid order has a refund on record." />
            ) : (
              <EmptyState icon={<IconAlert />} title={reasonTitle(reason ?? "unconfigured", "Refunds")} line={reasonLine(reason ?? "unconfigured", "refunds")} />
            )
          }
        />
      </section>
    </main>
  );
}
