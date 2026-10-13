import { formatPhoneLocal } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import type { OwedList, OwedRow } from "../../lib/adminTypes";
import { DataTable, type Column } from "../../components/DataTable";
import { RecordLink } from "../../components/links";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { IconBanknote } from "../../components/icons";
import { fmtDateTime, money, timeAgo } from "../../lib/format";
import { CashNav } from "../CashNav";

/**
 * Admin console v2 §6 — Money owed (undrawn; route (b)). Bikers whose balance is below zero, the longest
 * owing first. Commission is charged when a job closes (owner decision 3), so a biker who stacks jobs can go
 * briefly negative; this is the list ops call from.
 */
export default async function OwedPage() {
  const res = await adminFetchResult<OwedList>("/admin/cash/owed");
  const data = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = data !== null;

  const columns: Column<OwedRow>[] = [
    { key: "biker", header: "Biker", cell: (r) => <RecordLink href={`/riders/${r.riderId}`}>{r.name}</RecordLink> },
    { key: "owed", header: "Owes", className: "num", cell: (r) => <b>{money(r.owed)}</b> },
    {
      key: "since",
      header: "Owing since",
      className: "mut",
      cell: (r) => (r.negativeSince ? <span title={fmtDateTime(r.negativeSince)}>{timeAgo(r.negativeSince)}</span> : "—"),
    },
    { key: "job", header: "Last job", className: "mut", cell: (r) => (r.lastJobAt ? fmtDateTime(r.lastJobAt) : "—") },
    { key: "topup", header: "Last top-up", className: "mut", cell: (r) => (r.lastTopupAt ? fmtDateTime(r.lastTopupAt) : "never") },
    {
      key: "call",
      header: "",
      cell: (r) =>
        r.phone ? (
          <a className="btn quiet" href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} style={{ position: "relative", zIndex: 2 }}>
            Call {formatPhoneLocal(r.phone)}
          </a>
        ) : null,
    },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Money owed</h1>
        <span className="sub">Bikers below a $0 balance, longest first</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <CashNav active="/cash/owed" />

      <section className="card">
        <div className="block-title">
          Owed
          <span className="right">{data ? `${data.rows.length} bikers · ${money(data.total)}` : "—"}</span>
        </div>
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.riderId}
          empty={
            connected ? (
              <EmptyState icon={<IconBanknote />} title="Nobody owes money" line="Every biker's balance is $0 or more." />
            ) : (
              <EmptyState icon={<IconBanknote />} title={reasonTitle(reason ?? "unconfigured", "Money owed")} line={reasonLine(reason ?? "unconfigured", "balances")} />
            )
          }
        />
      </section>
    </main>
  );
}
