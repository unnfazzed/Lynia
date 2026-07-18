import { OrderStatus } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { DataTable, type Column } from "../components/DataTable";
import { FilterNav } from "../components/FilterNav";
import { StatusPill } from "../components/StatusPill";
import { IconPackage } from "../components/icons";

interface Order {
  id: string;
  status: string;
  proposedFare: string;
  agreedFare: string | null;
  distanceKm: number | null;
  riderId: string | null;
  cancelledByRole: "rider" | "customer" | null;
  cancelReason: string | null;
  createdAt: string;
}

const STATUSES = Object.values(OrderStatus);
const FILTERS = [{ value: "", label: "all" }, ...STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).status;
  const active = typeof raw === "string" && (STATUSES as string[]).includes(raw) ? raw : "";
  const res = await adminFetchResult<Order[]>(`/admin/orders${active ? `?status=${active}` : ""}`);
  const orders = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = orders !== null;

  const columns: Column<Order>[] = [
    { key: "id", header: "Order", className: "mono", cell: (o) => o.id.slice(0, 8) },
    { key: "status", header: "Status", cell: (o) => <StatusPill status={o.status} /> },
    { key: "fare", header: "Fare", className: "num", cell: (o) => `$${o.agreedFare ?? o.proposedFare}` },
    { key: "distance", header: "Distance", className: "num", cell: (o) => (o.distanceKm != null ? `${o.distanceKm} km` : "—") },
    {
      key: "note",
      header: "Note",
      className: "mut",
      cell: (o) =>
        o.cancelReason ? `cancelled${o.cancelledByRole ? ` (${o.cancelledByRole})` : ""}: ${o.cancelReason}` : "—",
    },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Orders monitor</h1>
        <span className="sub">Live order status across the pilot</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <FilterNav items={FILTERS} active={active} hrefFor={(v) => (v ? `/orders?status=${v}` : "/orders")} />

      <section className="card">
        <DataTable
          columns={columns}
          rows={orders ?? []}
          rowKey={(o) => o.id}
          getRowHref={(o) => `/orders/${o.id}`}
          rowLabel={(o) => `Open order ${o.id.slice(0, 8)}`}
          empty={
            connected ? (
              <EmptyState icon={<IconPackage />} title="No orders in this view" line="Try a different status filter." />
            ) : (
              <EmptyState
                icon={<IconPackage />}
                title={reasonTitle(reason ?? "unconfigured", "Orders")}
                line={reasonLine(reason ?? "unconfigured", "orders")}
              />
            )
          }
        />
        {/* The list is capped server-side (take: 100); note it so a full page doesn't read as "that's all". */}
        {orders && orders.length >= 100 ? (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>
            Showing the latest 100 orders — older orders aren&apos;t listed. Filter by status to narrow the view.
          </div>
        ) : null}
      </section>
    </main>
  );
}
