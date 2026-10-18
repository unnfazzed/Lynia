import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import { REASONS } from "../../lib/reasons";
import type { CustomerDetail, TripRow } from "../../lib/adminTypes";
import { DataTable, type Column } from "../../components/DataTable";
import { KpiCard } from "../../components/KpiCard";
import { KeyValue } from "../../components/KeyValue";
import { StatusPill, Pill } from "../../components/StatusPill";
import { ConfirmModal } from "../../components/ConfirmModal";
import { CustomerActions, LiftCashBanAction } from "./CustomerActions";
import { ReportsCallout } from "../../components/ReportsCallout";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { IconAlert, IconUser } from "../../components/icons";
import { OrderLink } from "../../components/links";
import { AuditCard, fetchAuditFor } from "../../components/AuditSection";
import { fetchTimeline, TimelineCard } from "../../components/Timeline";
import { money } from "../../lib/format";
import { PhoneReveal } from "../../components/PhoneReveal";
import { CallButton } from "../../components/CallButton";

/** Customer profile (kit `customers.html` detail): masked phone, spend, cancel pattern, rider
 *  reports, and flag / clear / ban actions — each reason-coded through <ConfirmModal>. */
export default async function CustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const tlCursor = typeof sp.tlCursor === "string" ? sp.tlCursor : undefined;
  // Admin console v2 §4 / §8: the customer-side timeline and the audit rows load alongside, best-effort.
  const [res, timeline, audit] = await Promise.all([
    adminFetchResult<CustomerDetail>(`/admin/customers/${id}`),
    fetchTimeline(`/admin/people/${id}/timeline?as=customer`, tlCursor),
    fetchAuditFor(id),
  ]);
  const path = `/customers/${id}`;

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
    { key: "id", header: "Order", cell: (t) => <OrderLink id={t.id} /> },
    { key: "route", header: "Route", cell: (t) => t.route },
    { key: "status", header: "Status", cell: (t) => <StatusPill status={t.status} /> },
    { key: "fare", header: "Fare", className: "num", cell: (t) => money(t.fare) },
    { key: "when", header: "When", className: "mut", cell: (t) => t.when },
  ];

  const flagged = c.status === "flagged";
  const onHold = c.status === "on_hold";

  return (
    <main className="content">
      <header className="page">
        <a className="back" href="/customers">
          ← Customers
        </a>
        <h1 style={{ fontSize: 18 }}>{c.name}</h1>
        <span style={{ display: "flex", gap: 6 }}>
          {c.status === "banned" ? <Pill kind="bad">banned</Pill> : onHold ? <Pill kind="bad">on hold</Pill> : flagged ? <Pill kind="bad">flagged</Pill> : <Pill kind="good">active</Pill>}
        </span>
        <Conn connected={connected} />
      </header>

      {c.warn ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">{c.warn}</span>
        </div>
      ) : null}

      <ReportsCallout reports={c.reports} subject="customer" />

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Orders" value={c.orders} hint={`since ${c.joined}`} size={22} />
        <KpiCard label="Spend" value={money(c.spend)} hint="agreed fares, cash" size={22} />
        <KpiCard label="Cancel rate" value={`${c.cancelRatePct}%`} hint="after a biker accepted" size={22} />
        <KpiCard label="Reports" value={c.flags || 0} hint="from bikers or recipients" size={22} />
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
                    <PhoneReveal
                      profileId={c.id}
                      masked={c.phoneMasked}
                      hint="masked — full number shows only during an active order"
                      connected={connected}
                    />
                  ),
                },
                { label: "Joined", value: c.joined },
                {
                  label: "Public name",
                  value: (
                    <span>
                      {c.publicName} <span className="mut" style={{ fontSize: 11 }}>what bikers see</span>
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
                No reports. Bikers can report a customer from the app after a no-show or unsafe pickup.
              </div>
            )}
          </section>

          <section className="card">
            <div className="block-title">Actions</div>
            {onHold && c.holdReason ? (
              <div className="mut" style={{ fontSize: 12, marginBottom: 8 }}>
                On hold — {c.holdReason}. They can&apos;t broadcast until the hold is lifted.
              </div>
            ) : null}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* S·2: the real, blocking hold/lift (mutates Profile.onHold + audit in one tx). The
                  flag/ban controls below remain audit-only placeholders (no backing model yet). */}
              <CallButton profileId={c.id} phone={c.phoneMasked} label="Call customer" connected={connected} />
              <CustomerActions id={c.id} name={c.name} onHold={onHold} connected={connected} />
              {/* X1/R-08: only shown once actually cash-banned — the ban itself has no console "apply"
                  counterpart (see LiftCashBanAction's docstring). */}
              {c.cashBanned ? <LiftCashBanAction id={c.id} name={c.name} connected={connected} /> : null}
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
                  consequence={
                    <span>
                      {/* UX-2026-07-16: mirrors the Ban modal's UX-2026-07-15 fix — no backing model exists
                          yet for a customer flag (see the comment on CustomerActions above), so this only
                          logs a decision for review. It does NOT put the account under review or create any
                          automated ban-escalation trigger. */}
                      <b>This records a flag decision for the record.</b> It does not automatically put the
                      account under review or trigger a ban escalation yet — follow up with a manual hold
                      (above) or a database admin for real enforcement.
                    </span>
                  }
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
                    {/* UX-2026-07-15: no backing model exists yet for a customer ban/flag (see the
                        comment on CustomerActions above) — this logs a decision for review, it does
                        NOT block the account or their phone number. Overclaiming enforcement here made
                        an operator believe the customer was already stopped from ordering. */}
                    <b>This records a ban decision for the record.</b> It does not automatically stop the customer
                    from ordering or block their phone number yet — follow up with a manual hold (above) or a
                    database admin for real enforcement.
                  </span>
                }
                reasons={REASONS.customerBan}
                noteRequired
                notePlaceholder="Required — what happened, and which orders are involved?"
                confirmLabel="Log ban decision"
              />
            </div>
            <div style={{ fontSize: 11, color: tokens.color.muted, marginTop: 10 }}>
              Flags and bans require a reason code and are recorded in the audit log.
            </div>
          </section>
        </div>
      </div>

      <TimelineCard
        page={timeline}
        cursor={tlCursor}
        pageHref={(next) => `/customers/${id}?tlCursor=${encodeURIComponent(next)}`}
        resetHref={`/customers/${id}`}
      />
      <AuditCard target={id} list={audit} />
    </main>
  );
}
