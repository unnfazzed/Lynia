import { MERCHANT_SHOP_KIND_LABELS, type MerchantShopKind } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import type { Merchant } from "../lib/adminTypes";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { DataTable, type Column } from "../components/DataTable";
import { Pill } from "../components/StatusPill";
import { IconStore } from "../components/icons";

/** The directory's views (merchant web upgrade L1): everyone, the go-live queue, and signed-up shops. */
const FILTERS = {
  awaiting_go_live: {
    label: "awaiting go-live",
    sub: "Restaurants that signed up and aren't switched on yet — newest first. Call each within a business day.",
    emptyTitle: "No restaurants waiting",
    emptyLine: "Every restaurant that signed up is switched on.",
  },
  shops: {
    label: "shops (signed up)",
    sub: "Shops open with LyniaGo Shops — no go-live yet. Call them about booking a rider.",
    emptyTitle: "No shops yet",
    emptyLine: "Shops that sign up on the merchant web will appear here.",
  },
} as const;
type Filter = keyof typeof FILTERS;

function kindLabel(m: Merchant): string {
  if (m.businessType !== "shop") return "Restaurant";
  const kind = m.shopKind && m.shopKind in MERCHANT_SHOP_KIND_LABELS ? MERCHANT_SHOP_KIND_LABELS[m.shopKind as MerchantShopKind] : null;
  return kind ? `Shop · ${kind}` : "Shop";
}

/** Merchant directory (X1): order volume + open collect-and-return debt per merchant — the console's
 *  first view into the restaurants vertical (mirrors riders/page.tsx's directory shape). L1 adds the
 *  business type, the landmark and the masked contact phone, and the go-live queue as a filter. */
export default async function MerchantsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const filter: Filter | null = typeof sp.filter === "string" && sp.filter in FILTERS ? (sp.filter as Filter) : null;
  const res = await adminFetchResult<Merchant[]>(`/admin/merchants${filter ? `?filter=${filter}` : ""}`);
  const merchants = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = merchants !== null;

  const columns: Column<Merchant>[] = [
    { key: "name", header: "Merchant", cell: (m) => m.name },
    { key: "type", header: "Type", cell: (m) => kindLabel(m) },
    { key: "landmark", header: "Landmark", className: "mut", cell: (m) => m.landmark ?? "—" },
    { key: "phone", header: "Phone", className: "mono mut", cell: (m) => m.contactPhoneMasked ?? "—" },
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
        <span className="sub">{filter ? FILTERS[filter].sub : "Every restaurant and shop on LyniaGo"}</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <div className="subnav">
        <a href="/merchants" aria-current={filter === null ? "page" : undefined}>
          all
        </a>
        {(Object.keys(FILTERS) as Filter[]).map((f) => (
          <a key={f} href={`/merchants?filter=${f}`} aria-current={filter === f ? "page" : undefined}>
            {FILTERS[f].label}
          </a>
        ))}
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
              <EmptyState
                icon={<IconStore />}
                title={filter ? FILTERS[filter].emptyTitle : "No merchants yet"}
                line={filter ? FILTERS[filter].emptyLine : "Restaurants and shops that sign up will appear here."}
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
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Showing the latest 100 merchants.
          </div>
        ) : null}
      </section>
    </main>
  );
}
