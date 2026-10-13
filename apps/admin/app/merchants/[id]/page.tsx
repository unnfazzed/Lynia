import { MERCHANT_SHOP_KIND_LABELS, type MerchantShopKind, tokens } from "@lynia/shared";
import { adminFetchResult } from "../../lib/api";
import type { MerchantApplication, MerchantDebtLedgerRow, MerchantDetail, MerchantMetrics, TripRow } from "../../lib/adminTypes";
import { DataTable, type Column } from "../../components/DataTable";
import { KpiCard } from "../../components/KpiCard";
import { KeyValue } from "../../components/KeyValue";
import { StatusPill, Pill } from "../../components/StatusPill";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { IconStore } from "../../components/icons";
import { ApplicationActionButton, LicenceButtons } from "../ApplicationActions";
import { ApplicationCard, ApplicationStatusPill, MetricsCard } from "../application-ui";
import { OrderSettingsCard } from "../OrderSettingsCard";
import { OwnerTransferButton } from "../OwnerTransferButton";
import { OrderLink, RecordLink } from "../../components/links";
import { AuditCard, fetchAuditFor } from "../../components/AuditSection";
import { fetchTimeline, TimelineCard } from "../../components/Timeline";
import { fmtDateTime, money, shortId } from "../../lib/format";

const DEBT_TYPE_LABEL: Record<MerchantDebtLedgerRow["type"], string> = {
  opened: "Debt opened",
  settled_cash: "Settled — cash returned",
  settled_goods: "Settled — goods returned",
  written_off: "Written off",
};

/** Merchant profile (X1): cash rule, recent orders, and the full append-only collect-and-return debt-ledger
 *  trail (R-01/R-06/R-07). Admin console v2 §5: while the business isn't live, its application card (a
 *  data-backed checklist and the actions its state allows) sits at the top; a live one can be suspended from
 *  the header. The performance card and the handover to a new owner (L4) follow. Both reads beside the
 *  detail are optional: an older API without them simply shows neither card. */
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
  const tlCursor = typeof sp.tlCursor === "string" ? sp.tlCursor : undefined;
  // Admin console v2 §4 / §5 / §8: application, metrics, timeline and audit rows load alongside the profile, best-effort.
  const [res, appRes, metricsRes, timeline, audit] = await Promise.all([
    adminFetchResult<MerchantDetail>(`/admin/merchants/${id}${debtCursor ? `?debtCursor=${encodeURIComponent(debtCursor)}` : ""}`),
    adminFetchResult<MerchantApplication>(`/admin/merchants/${id}/application`),
    adminFetchResult<MerchantMetrics>(`/admin/merchants/${id}/metrics`),
    fetchTimeline(`/admin/merchants/${id}/timeline`, tlCursor),
    fetchAuditFor(id),
  ]);
  const app = "data" in appRes ? appRes.data : null;
  const metrics = "data" in metricsRes ? metricsRes.data : null;

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
  const isShop = m.businessType === "shop";
  const kind = m.shopKind && m.shopKind in MERCHANT_SHOP_KIND_LABELS ? MERCHANT_SHOP_KIND_LABELS[m.shopKind as MerchantShopKind] : null;

  const tripCols: Column<TripRow>[] = [
    { key: "id", header: "Order", cell: (t) => <OrderLink id={t.id} /> },
    { key: "route", header: "Route", cell: (t) => t.route },
    { key: "status", header: "Status", cell: (t) => <StatusPill status={t.status} /> },
    { key: "fare", header: "Total", className: "num", cell: (t) => money(t.fare) },
    { key: "when", header: "When", className: "mut", cell: (t) => t.when },
  ];

  const ledgerCols: Column<MerchantDebtLedgerRow>[] = [
    { key: "at", header: "When", className: "mut", cell: (l) => fmtDateTime(l.at) },
    { key: "type", header: "Type", cell: (l) => DEBT_TYPE_LABEL[l.type] ?? l.type },
    {
      key: "amount",
      header: "Amount",
      className: "num",
      cell: (l) => {
        const v = Number(l.amount);
        return <span style={{ color: v < 0 ? tokens.color.accentText : tokens.color.danger, fontWeight: 600 }}>{v < 0 ? money(v) : `+${money(v)}`}</span>;
      },
    },
    {
      key: "order",
      header: "Order",
      cell: (l) => <OrderLink id={l.orderId} />,
    },
    {
      key: "rider",
      header: "Biker",
      cell: (l) => <RecordLink href={`/riders/${l.riderId}`}>{l.riderName || shortId(l.riderId)}</RecordLink>,
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
          <Pill kind="mut">{isShop ? (kind ? `shop · ${kind.toLowerCase()}` : "shop") : "restaurant"}</Pill>
          <Pill kind="mut">{m.cashRule === "collect_and_return" ? "collect & return" : "pay upfront"}</Pill>
          {app ? <ApplicationStatusPill status={app.status} /> : m.pilotEnabled ? <Pill kind="good">live</Pill> : null}
        </span>
        <Conn connected={connected} />
        <OwnerTransferButton merchantId={m.id} name={m.name} connected={connected} />
        {app?.actions.includes("suspend") ? <ApplicationActionButton merchantId={m.id} name={m.name} action="suspend" connected={connected} /> : null}
      </header>

      {app && app.status !== "live" ? <ApplicationCard app={app} name={m.name} connected={connected} /> : null}

      {!app && !m.pilotEnabled ? (
        <div className="warnbar">
          <IconStore />
          <span className="t">
            <b>Customers can&apos;t see this {isShop ? "shop" : "restaurant"} yet.</b> Call {m.contactPhone ?? "the owner"}.
          </span>
        </div>
      ) : null}

      {app && app.status === "live" && app.checklist.some((r) => r.warning) ? (
        <div className="warnbar">
          <IconStore />
          <span className="t">
            <b>No verified pharmacy licence.</b> It went live before licences were checked. Record it after the next call.
          </span>
          <span style={{ display: "flex", gap: tokens.space.sm, flexWrap: "wrap" }}>
            <LicenceButtons merchantId={m.id} name={m.name} connected={connected} recorded={!!app.licence} verified={!!app.licence?.verifiedAt} />
          </span>
        </div>
      ) : null}

      {m.openDebtCount > 0 ? (
        <div className="warnbar">
          <IconStore />
          <span className="t">
            <b>{money(m.openDebtAmount)} in open collect-and-return debt</b> across {m.openDebtCount} order
            {m.openDebtCount > 1 ? "s" : ""}. The ledger below shows which biker and order.
          </span>
        </div>
      ) : null}

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Orders" value={m.orders} hint={`since ${m.joined}`} size={22} />
        <KpiCard
          label="Open debt"
          value={money(m.openDebtAmount)}
          hint={m.openDebtCount > 0 ? `${m.openDebtCount} unsettled` : "none owed"}
          size={22}
        />
        <KpiCard label="Cuisine" value={m.cuisineTags[0] ?? "—"} hint={m.cuisineTags.slice(1).join(", ") || "no tags"} size={22} />
      </section>

      {metrics ? (
        <div style={{ marginBottom: tokens.space.lg }}>
          <MetricsCard m={metrics} />
        </div>
      ) : null}

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
          <OrderSettingsCard
            merchantId={m.id}
            name={m.name}
            autoAccept={m.autoAccept ?? false}
            showPhoneToCustomers={m.showPhoneToCustomers ?? false}
            freeDelivery={m.freeDelivery ?? false}
            shop={isShop}
            connected={connected}
          />
          <section className="card">
            <div className="block-title">Details</div>
            <KeyValue
              rows={[
                { label: "Type", value: isShop ? (kind ? `Shop · ${kind}` : "Shop") : "Restaurant" },
                { label: "Contact phone", value: m.contactPhone ?? "—" },
                { label: "Landmark", value: m.landmark ?? "—" },
                {
                  label: "Pin",
                  value: m.pin ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${m.pin.lat},${m.pin.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: tokens.color.accentText }}
                    >
                      {m.pin.lat.toFixed(5)}, {m.pin.lng.toFixed(5)} ↗
                    </a>
                  ) : (
                    "—"
                  ),
                },
                { label: "Cash rule", value: m.cashRule === "collect_and_return" ? "Collect & return" : "Pay upfront" },
                { label: "Busy mode", value: m.busyMode ? "On (+10 min prep)" : "Off" },
                // Merchant web upgrade L2 (R2-5): the whole business's bookings are held by holding the
                // one customer account they're all made as, with the customer hold that already exists.
                ...(m.bookingAccount !== undefined
                  ? [
                      {
                        label: "Book a biker",
                        value: m.bookingAccount ? (
                          <a href={`/customers/${m.bookingAccount.id}`} style={{ color: tokens.color.accentText }}>
                            {m.bookingAccount.onHold ? "On hold — lift it on the booking account →" : "Active — hold it on the booking account →"}
                          </a>
                        ) : (
                          "No bookings yet"
                        ),
                      },
                    ]
                  : []),
                { label: "Joined", value: m.joined },
                ...(m.description ? [{ label: "Description", value: m.description }] : []),
              ]}
            />
          </section>
          <div style={{ fontSize: 11, color: tokens.color.muted }}>
            To act on owed cash, open the biker or customer named in the ledger below.
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

      <TimelineCard
        page={timeline}
        cursor={tlCursor}
        pageHref={(c) => `/merchants/${id}?tlCursor=${encodeURIComponent(c)}`}
        resetHref={`/merchants/${id}`}
      />
      <AuditCard target={id} list={audit} />
    </main>
  );
}
