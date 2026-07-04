import { tokens } from "@lynia/shared";
import { adminFetch } from "../lib/api";
import type { Customer } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { Pill } from "../components/StatusPill";
import { FilterNav } from "../components/FilterNav";
import { Conn, EmptyState, OfflineBanner } from "../components/states";
import { IconUser } from "../components/icons";

/**
 * Customers directory (kit `customers.html`). Masked contact, spend and cancel pattern; flagged
 * customers surface a danger pill. Rows link into the profile at /customers/[id]. Renders the
 * offline placeholder when `adminFetch` returns null (API_BASE_URL unset).
 */
const FILTERS = [
  { value: "all", label: "all" },
  { value: "active", label: "active" },
  { value: "flagged", label: "flagged" },
];

function custPill(status: Customer["status"]) {
  if (status === "banned") return <Pill kind="bad">banned</Pill>;
  if (status === "flagged") return <Pill kind="bad">flagged</Pill>;
  return <Pill kind="good">active</Pill>;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const raw = searchParams.filter;
  const active = typeof raw === "string" && FILTERS.some((f) => f.value === raw) ? raw : "all";
  const query = active === "all" ? "" : `?filter=${active}`;
  const customers = await adminFetch<Customer[]>(`/admin/customers${query}`);
  const connected = customers !== null;

  const columns: Column<Customer>[] = [
    { key: "name", header: "Customer", cell: (c) => c.name },
    { key: "phone", header: "Phone", className: "mono", cell: (c) => c.phoneMasked },
    { key: "orders", header: "Orders", className: "num", cell: (c) => c.orders },
    { key: "spend", header: "Spend", className: "num", cell: (c) => `$${c.spend}` },
    {
      key: "cancel",
      header: "Cancel rate",
      className: "num",
      cell: (c) => (
        <span style={c.cancelRatePct >= 25 ? { color: tokens.color.danger } : undefined}>{c.cancelRatePct}%</span>
      ),
    },
    {
      key: "flags",
      header: "Flags",
      cell: (c) =>
        c.flags > 0 ? (
          <Pill kind="bad">
            {c.flags} {c.flags > 1 ? "reports" : "report"}
          </Pill>
        ) : (
          <span className="mut">—</span>
        ),
    },
    { key: "joined", header: "Joined", className: "mut", cell: (c) => c.joined },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Customers</h1>
        <span className="sub">
          {customers ? `${customers.length} customers · Harare pilot` : "Harare pilot"}
        </span>
        <Conn connected={connected} />
      </header>

      {!connected ? <OfflineBanner /> : null}

      <FilterNav items={FILTERS} active={active} hrefFor={(v) => (v === "all" ? "/customers" : `/customers?filter=${v}`)} />

      <section className="card">
        <DataTable
          columns={columns}
          rows={customers ?? []}
          rowKey={(c) => c.id}
          getRowHref={(c) => `/customers/${c.id}`}
          rowLabel={(c) => `Open ${c.name}`}
          empty={
            connected ? (
              <EmptyState
                icon={<IconUser />}
                title="No customers in this view"
                line="New sign-ups appear here after their first broadcast."
              />
            ) : (
              <EmptyState
                icon={<IconUser />}
                title="Customer directory not connected"
                line="Set API_BASE_URL (and ADMIN_API_TOKEN) to show live data."
              />
            )
          }
        />
      </section>

      {/* Status pill legend mirrors the directory copy; also anchors the good/bad convention. */}
      <div style={{ display: "flex", gap: tokens.space.md, marginTop: tokens.space.md, fontSize: 12 }}>
        {custPill("active")}
        {custPill("flagged")}
      </div>
    </main>
  );
}
