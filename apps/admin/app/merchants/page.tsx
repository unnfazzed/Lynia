import { adminFetchResult } from "../lib/api";
import type { Merchant } from "../lib/adminTypes";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { DataTable, type Column } from "../components/DataTable";
import { Pill } from "../components/StatusPill";
import { IconStore } from "../components/icons";

/** Merchant directory (X1): order volume + open collect-and-return debt per merchant — the console's
 *  first view into the restaurants vertical (mirrors riders/page.tsx's directory shape). */
export default async function MerchantsPage() {
  const res = await adminFetchResult<Merchant[]>("/admin/merchants");
  const merchants = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = merchants !== null;

  const columns: Column<Merchant>[] = [
    { key: "name", header: "Merchant", cell: (m) => m.name },
    {
      key: "cashRule",
      header: "Cash rule",
      cell: (m) => <Pill kind="mut">{m.cashRule === "collect_and_return" ? "collect & return" : "pay upfront"}</Pill>,
    },
    { key: "pilot", header: "Pilot", cell: (m) => (m.pilotEnabled ? <Pill kind="good">enabled</Pill> : <Pill>—</Pill>) },
    { key: "orders", header: "Orders", className: "num", cell: (m) => m.orders },
    {
      key: "debt",
      header: "Open debt",
      className: "num",
      cell: (m) =>
        m.openDebtCount > 0 ? (
          <span style={{ color: "var(--danger)", fontWeight: 600 }}>
            ${m.openDebtAmount} · {m.openDebtCount}
          </span>
        ) : (
          <span className="mut">$0.00</span>
        ),
    },
    { key: "joined", header: "Joined", className: "mut", cell: (m) => m.joined },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Merchants</h1>
        <span className="sub">The restaurants vertical — every onboarded kitchen</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <div className="subnav">
        <a href="/merchants" aria-current="page">
          all
        </a>
        <a href="/merchants/disputes">disputes needing support</a>
      </div>

      <section className="card">
        <DataTable
          columns={columns}
          rows={merchants ?? []}
          rowKey={(m) => m.id}
          getRowHref={(m) => `/merchants/${m.id}`}
          rowLabel={(m) => `Open ${m.name}`}
          empty={
            connected ? (
              <EmptyState icon={<IconStore />} title="No merchants yet" line="Onboarded kitchens will appear here." />
            ) : (
              <EmptyState
                icon={<IconStore />}
                title={reasonTitle(reason ?? "unconfigured", "Merchants")}
                line={reasonLine(reason ?? "unconfigured", "merchants")}
              />
            )
          }
        />
        {merchants && merchants.length >= 100 ? (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Showing the latest 100 merchants.
          </div>
        ) : null}
      </section>
    </main>
  );
}
