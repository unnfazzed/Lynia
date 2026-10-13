import { MERCHANT_APPLICATION_STATUSES, MERCHANT_APPLICATION_STATUS_LABELS, MERCHANT_SHOP_KIND_LABELS, type MerchantShopKind } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import type { Merchant, MerchantApplicationStatus } from "../lib/adminTypes";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { DataTable, type Column } from "../components/DataTable";
import { Pill } from "../components/StatusPill";
import { IconStore } from "../components/icons";
import { money } from "../lib/format";
import { ApplicationStatusPill, SlaPill } from "./application-ui";

/** The directory's other view (merchant web upgrade L1): signed-up shops, live or not. */
const FILTERS = {
  shops: {
    label: "shops",
    sub: "Every shop that signed up, live or not. Newest first.",
    emptyTitle: "No shops yet",
    emptyLine: "Shops that sign up will appear here.",
  },
} as const;
type Filter = keyof typeof FILTERS;

/** Admin console v2 §5: one chip per application state. The waiting states read oldest first. */
const STATUS_COPY: Record<MerchantApplicationStatus, { sub: string; emptyLine: string }> = {
  applied: { sub: "Signed up, not reviewed yet. Oldest first. Call each within a day.", emptyLine: "No one is waiting." },
  reviewing: { sub: "Being checked. Oldest first.", emptyLine: "Nothing in review." },
  approved: { sub: "Approved, not live yet. Oldest first.", emptyLine: "Nothing waiting to go live." },
  live: { sub: "Customers can see these and order.", emptyLine: "No business is live." },
  rejected: { sub: "Turned down. Newest first.", emptyLine: "No rejected applications." },
  suspended: { sub: "Off for customers. Orders already placed carry on.", emptyLine: "Nothing is suspended." },
};

function kindLabel(m: Merchant): string {
  if (m.businessType !== "shop") return "Restaurant";
  const kind = m.shopKind && m.shopKind in MERCHANT_SHOP_KIND_LABELS ? MERCHANT_SHOP_KIND_LABELS[m.shopKind as MerchantShopKind] : null;
  return kind ? `Shop · ${kind}` : "Shop";
}

function isStatus(v: unknown): v is MerchantApplicationStatus {
  return typeof v === "string" && (MERCHANT_APPLICATION_STATUSES as readonly string[]).includes(v);
}

/** Merchant directory (X1) and the application queue (admin console v2 §5). `?filter=awaiting_go_live`
 *  (the old go-live queue) now opens the applied queue. */
export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const status: MerchantApplicationStatus | null = isStatus(sp.status) ? sp.status : sp.filter === "awaiting_go_live" ? "applied" : null;
  const filter: Filter | null = !status && typeof sp.filter === "string" && sp.filter in FILTERS ? (sp.filter as Filter) : null;
  const query = status ? `?status=${status}` : filter ? `?filter=${filter}` : "";
  const res = await adminFetchResult<Merchant[]>(`/admin/merchants${query}`);
  const merchants = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = merchants !== null;

  const statusCol: Column<Merchant> = {
    key: "status",
    header: "Status",
    cell: (m) => (m.applicationStatus ? <ApplicationStatusPill status={m.applicationStatus} /> : m.pilotEnabled ? <Pill kind="good">live</Pill> : <Pill>—</Pill>),
  };

  const queueColumns: Column<Merchant>[] = [
    { key: "name", header: "Merchant", cell: (m) => m.name },
    { key: "type", header: "Type", cell: (m) => kindLabel(m) },
    { key: "area", header: "Area", className: "mut", cell: (m) => m.landmark ?? "—" },
    { key: "age", header: "Waiting", cell: (m) => (m.appliedAt ? <SlaPill sla={m.sla} since={m.appliedAt} /> : "—") },
    { key: "score", header: "Checks", className: "num", cell: (m) => (m.score ? `${m.score.passed}/${m.score.total}` : "—") },
    statusCol,
  ];

  const directoryColumns: Column<Merchant>[] = [
    { key: "name", header: "Merchant", cell: (m) => m.name },
    { key: "type", header: "Type", cell: (m) => kindLabel(m) },
    { key: "landmark", header: "Landmark", className: "mut", cell: (m) => m.landmark ?? "—" },
    { key: "phone", header: "Phone", className: "mono mut", cell: (m) => m.contactPhoneMasked ?? "—" },
    {
      key: "cashRule",
      header: "Cash rule",
      cell: (m) => <Pill kind="mut">{m.cashRule === "collect_and_return" ? "collect & return" : "pay upfront"}</Pill>,
    },
    statusCol,
    { key: "orders", header: "Orders", className: "num", cell: (m) => m.orders },
    {
      key: "debt",
      header: "Open debt",
      className: "num",
      cell: (m) =>
        m.openDebtCount > 0 ? (
          <span style={{ color: "var(--danger)", fontWeight: 600 }}>
            {money(m.openDebtAmount)} · {m.openDebtCount}
          </span>
        ) : (
          <span className="mut">{money(0)}</span>
        ),
    },
    { key: "joined", header: "Joined", className: "mut", cell: (m) => m.joined },
  ];

  const sub = status ? STATUS_COPY[status].sub : filter ? FILTERS[filter].sub : "Every restaurant and shop on LyniaGo";

  return (
    <main className="content">
      <header className="page">
        <h1>Merchants</h1>
        <span className="sub">{sub}</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <div className="subnav">
        <a href="/merchants" aria-current={status === null && filter === null ? "page" : undefined}>
          all
        </a>
        {MERCHANT_APPLICATION_STATUSES.map((s) => (
          <a key={s} href={`/merchants?status=${s}`} aria-current={status === s ? "page" : undefined}>
            {MERCHANT_APPLICATION_STATUS_LABELS[s].toLowerCase()}
          </a>
        ))}
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <a key={f} href={`/merchants?filter=${f}`} aria-current={filter === f ? "page" : undefined}>
            {FILTERS[f].label}
          </a>
        ))}
        <a href="/merchants/disputes">disputes</a>
      </div>

      <section className="card">
        <DataTable
          columns={status ? queueColumns : directoryColumns}
          rows={merchants ?? []}
          rowKey={(m) => m.id}
          getRowHref={(m) => `/merchants/${m.id}`}
          rowLabel={(m) => `Open ${m.name}`}
          empty={
            connected ? (
              <EmptyState
                icon={<IconStore />}
                title={status ? `Nothing ${MERCHANT_APPLICATION_STATUS_LABELS[status].toLowerCase()}` : filter ? FILTERS[filter].emptyTitle : "No merchants yet"}
                line={status ? STATUS_COPY[status].emptyLine : filter ? FILTERS[filter].emptyLine : "Restaurants and shops that sign up will appear here."}
              />
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
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>Showing the first 100.</div>
        ) : null}
      </section>
    </main>
  );
}
