import { OrderStatus } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { DataTable, type Column } from "../components/DataTable";
import { FilterNav } from "../components/FilterNav";
import { StatusPill, Pill } from "../components/StatusPill";
import { IconPackage } from "../components/icons";

interface Order {
  id: string;
  orderType: "parcel" | "merchant";
  status: string;
  route: string;
  merchant: string | null;
  rider: string | null;
  proposedFare: string;
  agreedFare: string | null;
  distanceKm: number | null;
  riderId: string | null;
  cancelledByRole: "rider" | "customer" | null;
  cancelReason: string | null;
  createdAt: string;
}

const STATUSES = Object.values(OrderStatus);
const TYPES: Array<{ value: string; label: string }> = [
  { value: "", label: "all" },
  { value: "parcel", label: "parcel" },
  { value: "merchant", label: "food" },
];

/** Compact "N min/hr ago" for the Created column (server-rendered once; no hydration risk). */
function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}
const FILTERS = [{ value: "", label: "all" }, ...STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, " ") }))];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const rawStatus = sp.status;
  const rawType = sp.type;
  const active = typeof rawStatus === "string" && (STATUSES as string[]).includes(rawStatus) ? rawStatus : "";
  const activeType = typeof rawType === "string" && TYPES.some((t) => t.value === rawType) ? rawType : "";
  const query = [active && `status=${active}`, activeType && `type=${activeType}`].filter(Boolean).join("&");
  const res = await adminFetchResult<Order[]>(`/admin/orders${query ? `?${query}` : ""}`);
  const orders = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = orders !== null;

  // X1: type filter carries the status filter forward (and vice versa) so the two compose instead of
  // one silently resetting the other.
  const hrefForStatus = (v: string) => {
    const q = [v && `status=${v}`, activeType && `type=${activeType}`].filter(Boolean).join("&");
    return q ? `/orders?${q}` : "/orders";
  };
  const hrefForType = (v: string) => {
    const q = [active && `status=${active}`, v && `type=${v}`].filter(Boolean).join("&");
    return q ? `/orders?${q}` : "/orders";
  };

  const columns: Column<Order>[] = [
    { key: "id", header: "Order", className: "mono", cell: (o) => o.id.slice(0, 8) },
    { key: "type", header: "Type", cell: (o) => (o.orderType === "merchant" ? <Pill kind="mut">food</Pill> : <Pill kind="mut">parcel</Pill>) },
    { key: "route", header: "Route / merchant", cell: (o) => (o.orderType === "merchant" ? o.merchant ?? o.route : o.route) },
    { key: "status", header: "Status", cell: (o) => <StatusPill status={o.status} /> },
    { key: "rider", header: "Rider", className: "mut", cell: (o) => o.rider ?? "—" },
    { key: "fare", header: "Fare", className: "num", cell: (o) => `$${o.agreedFare ?? o.proposedFare}` },
    { key: "created", header: "Created", className: "mut num", cell: (o) => timeAgo(o.createdAt) },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>Orders monitor</h1>
        <span className="sub">Live order status across the pilot</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <FilterNav items={TYPES} active={activeType} hrefFor={hrefForType} />
      <FilterNav items={FILTERS} active={active} hrefFor={hrefForStatus} />

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
