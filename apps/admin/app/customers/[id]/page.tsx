import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import { REASONS } from "../../lib/reasons";
import type { CustomerDetail, TripRow } from "../../lib/adminTypes";
import { DataTable, type Column } from "../../components/DataTable";
import { KpiCard } from "../../components/KpiCard";
import { KeyValue } from "../../components/KeyValue";
import { StatusPill, Pill } from "../../components/StatusPill";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { IconAlert, IconUser } from "../../components/icons";

/** Customer profile (kit `customers.html` detail): masked phone, spend, cancel pattern, rider
 *  reports, and flag / clear / ban actions — each reason-coded through <ConfirmModal>. */
export default async function CustomerProfilePage({ params }: { params: { id: string } }) {
  const res = await adminFetchResult<CustomerDetail>(`/admin/customers/${params.id}`);
  const path = `/customers/${params.id}`;

  if (!("data" in res)) {
    const reason = res.reason;
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/customers">
            ← Customers
          </a>
          <h1 style={{ fontSize: 18 }}>Customer profile</h1>
          <Conn connected={false} reason={reason} />
        </header>
        <OfflineBanner reason={reason} />
        <section className="card">
          <EmptyState
            icon={<IconUser />}
            title={reasonTitle(reason, "Profile")}
            line={reasonLine(reason, "this customer")}
          />
        </section>
      </main>
    );
  }

  const c = res.data;
  // Past the guard `c` is live data, so the console is connected and mutating actions are enabled.
  const connected = true;

  const tripCols: Column<TripRow>[] = [
    { key: "id", header: "Order", className: "mono", cell: (t) => t.id },
    { key: "route", header: "Route", cell: (t) => t.route },
    { key: "status", header: "Status", cell: (t) => <StatusPill status={t.status} /> },
    { key: "fare", header: "Fare", className: "num", cell: (t) => `$${t.fare}` },
    { key: "when", header: "When", className: "mut", cell: (t) => t.when },
  ];

  const flagged = c.status === "flagged";

  return (
    <main className="content">
      <header className="page">
        <a className="back" href="/customers">
          ← Customers
        </a>
        <h1 style={{ fontSize: 18 }}>{c.name}</h1>
        <span style={{ display: "flex", gap: 6 }}>
          {c.status === "banned" ? <Pill kind="bad">banned</Pill> : flagged ? <Pill kind="bad">flagged</Pill> : <Pill kind="good">active</Pill>}
        </span>
        <Conn connected={connected} />
      </header>

      {c.warn ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t" dangerouslySetInnerHTML={{ __html: c.warn }} />
        </div>
      ) : null}

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Orders" value={c.orders} hint={`since ${c.joined}`} size={22} />
        <KpiCard label="Spend" value={`$${c.spend}`} hint="agreed fares, cash" size={22} />
        <KpiCard label="Cancel rate" value={`${c.cancelRatePct}%`} hint="after a rider accepted" size={22} />
        <KpiCard label="Reports" value={c.flags || 0} hint="from riders or recipients" size={22} />
      </section>

      <div className="detail-grid">
        <section className="card">
          <div className="block-title">Recent orders</div>
          <DataTable
            columns={tripCols}
            rows={c.trail}
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
                {
                  label: "Phone",
                  value: (
                    <span className="mono">
                      {c.phoneMasked}{" "}
                      <span className="mut" style={{ fontSize: 11, fontFamily: tokens.font.family }}>
                        masked — full number shows only during an active order
                      </span>
                    </span>
                  ),
                },
                { label: "Joined", value: c.joined },
                {
                  label: "Public name",
                  value: (
                    <span>
                      {c.publicName} <span className="mut" style={{ fontSize: 11 }}>what riders see</span>
                    </span>
                  ),
                },
              ]}
            />
          </section>

          <section className="card">
            <div className="block-title">Reports against this customer</div>
            {c.flagLog.length > 0 ? (
              c.flagLog.map((f, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "8px 0",
                    borderTop: `1px solid ${tokens.color.line}`,
                    fontSize: 13,
                  }}
                >
                  <span className="mut num" style={{ flex: "none", fontSize: 12 }}>
                    {f.date}
                  </span>
                  <span style={{ flex: 1 }}>
                    {f.text}{" "}
                    {f.issueId ? (
                      <a href={`/issues/${f.issueId}`} style={{ color: tokens.color.accentText }}>
                        Open issue →
                      </a>
                    ) : null}
                  </span>
                </div>
              ))
            ) : (
              <div className="mut" style={{ fontSize: 13 }}>
                No reports. Riders can report a customer from the app after a no-show or unsafe pickup.
              </div>
            )}
          </section>

          <section className="card">
            <div className="block-title">Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {flagged ? (
                <ConfirmModal
                  action="customer.clear_flag"
                  target={c.name}
                  path={path}
                  triggerLabel="Clear flag…"
                  triggerVariant="ghost"
                  disabled={!connected}
                  title={`Clear the flag on ${c.name}?`}
                  consequence="The account returns to good standing. The report history stays on record."
                  reasons={REASONS.customerClearFlag}
                  confirmLabel="Clear flag"
                />
              ) : (
                <ConfirmModal
                  action="customer.flag"
                  target={c.name}
                  path={path}
                  triggerLabel="Flag account…"
                  triggerVariant="ghost"
                  disabled={!connected}
                  title={`Flag ${c.name}?`}
                  consequence="A flag marks the account for review. The customer can keep ordering, but new reports escalate to a ban decision."
                  reasons={REASONS.customerFlag}
                  confirmLabel="Flag account"
                />
              )}
              <ConfirmModal
                action="customer.ban"
                target={c.name}
                path={path}
                triggerLabel="Ban customer…"
                triggerVariant="danger"
                danger
                disabled={!connected}
                title={`Ban ${c.name}?`}
                consequence={
                  <span>
                    <b>They can no longer send parcels.</b> Their phone number is blocked from re-registering. This is
                    reversible only by a database admin.
                  </span>
                }
                reasons={REASONS.customerBan}
                noteRequired
                notePlaceholder="Required — what happened, and which orders are involved?"
                confirmLabel="Ban customer"
              />
            </div>
            <div style={{ fontSize: 11, color: tokens.color.muted, marginTop: 10 }}>
              Flags and bans require a reason code and are recorded in the audit log.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
