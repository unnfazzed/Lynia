import type { AdminFleetDetail, AdminFleetRow } from "@lynia/shared";
import { DataTable, type Column } from "../components/DataTable";
import { FilterNav } from "../components/FilterNav";
import { IconAlert, IconRotate, IconStore, IconX } from "../components/icons";
import { Conn, EmptyState, OfflineBanner, SubsectionUnavailable } from "../components/states";
import { Pill } from "../components/StatusPill";
import { adminFetchResult } from "../lib/api";
import { OBA, OBA_FRAME } from "../lib/own-bikers-copy";
import { FleetPanel } from "./FleetPanel";
import { asFilter, brandOf, FILTERS, filterCounts, filterRows, overdueCell, statusPill, usd } from "./fleet-view";

/**
 * OB-A1 · Own bikers in the console (handoff own-bikers-v1, ledger D-117): one row per business that runs its own
 * bikers — the business and its branches, bikers, this week's fees, what's unpaid and how late, and a status — sorted
 * by the API (longest overdue first). The subnav filters by status; a row opens its side panel (OB-A2) beside the
 * table. Reads `GET /admin/fleets` and, for the open row, `GET /admin/fleets/:ownerId`.
 */
export default async function OwnBikersPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = (await searchParams) ?? {};
  const filter = asFilter(sp.status);
  const ownerId = typeof sp.owner === "string" ? sp.owner : null;
  const res = await adminFetchResult<AdminFleetRow[]>("/admin/fleets");
  const rows = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = rows !== null;
  const open = ownerId && rows ? (rows.find((r) => r.ownerProfileId === ownerId) ?? null) : null;
  const detailRes = open ? await adminFetchResult<AdminFleetDetail>(`/admin/fleets/${open.ownerProfileId}`) : null;
  const detail = detailRes && "data" in detailRes ? detailRes.data : null;

  const hrefFor = (status: string, owner?: string) => {
    const q = new URLSearchParams();
    if (status !== "all") q.set("status", status);
    if (owner) q.set("owner", owner);
    const s = q.toString();
    return s ? `/own-bikers?${s}` : "/own-bikers";
  };
  const counts = rows ? filterCounts(rows) : null;
  const named = (r: AdminFleetRow) => brandOf(r.branchNames ?? [], r.owner);

  const columns: Column<AdminFleetRow>[] = [
    { key: "owner", header: OBA.cols[0], cell: (r) => <b style={{ fontWeight: 600 }}>{named(r).brand}</b> },
    { key: "branches", header: OBA.cols[1], className: "mut", cell: (r) => named(r).branches.join(", ") || "—" },
    { key: "bikers", header: OBA.cols[2], cell: (r) => r.bikers },
    { key: "week", header: OBA.cols[3], align: "right", cell: (r) => usd(r.thisWeek) },
    { key: "unpaid", header: OBA.cols[4], align: "right", cell: (r) => <span style={{ fontWeight: 600 }}>{usd(r.unpaid)}</span> },
    {
      key: "overdue",
      header: OBA.cols[5],
      align: "right",
      cell: (r) => {
        const c = overdueCell(r.daysOverdue);
        return <span style={c.loud ? { color: "var(--danger-ink)", fontWeight: 600 } : undefined}>{c.text}</span>;
      },
    },
    {
      key: "status",
      header: OBA.cols[6],
      cell: (r) => {
        const p = statusPill(r.status);
        return (
          <Pill kind={p.kind} dot>
            {p.label}
          </Pill>
        );
      },
    },
  ];

  return (
    <main className="content ob">
      <header className="page">
        <h1>{OBA.title}</h1>
        {rows ? <span className="sub">{OBA.sub(rows.length)}</span> : null}
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected && reason !== "error" ? <OfflineBanner reason={reason} /> : null}

      <FilterNav
        items={FILTERS.map((f) => ({ value: f.value, label: counts ? OBA_FRAME.chip(f.label, counts[f.value]) : f.label }))}
        active={filter}
        hrefFor={(v) => hrefFor(v)}
      />

      <section className="card" style={{ padding: "16px 24px" }}>
        <DataTable
          columns={columns}
          rows={rows ? filterRows(rows, filter) : []}
          rowKey={(r) => r.ownerProfileId}
          getRowHref={(r) => hrefFor(filter, r.ownerProfileId)}
          rowLabel={(r) => named(r).brand}
          isSelected={(r) => r.ownerProfileId === open?.ownerProfileId}
          empty={rows ? <EmptyState icon={<IconStore />} title={OBA.emptyT} line={OBA.emptyB} /> : <FleetsError retryHref={hrefFor(filter)} />}
        />
      </section>

      {open ? (
        detail ? (
          <FleetPanel row={open} detail={detail} brand={named(open).brand} branches={named(open).branches} closeHref={hrefFor(filter)} connected={connected} />
        ) : (
          <aside className="ob-panel" aria-label={named(open).brand}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{named(open).brand}</h2>
              <a className="ob-close" href={hrefFor(filter)} aria-label="Close">
                <IconX width={18} height={18} />
              </a>
            </div>
            <SubsectionUnavailable noun="this fleet" />
          </aside>
        )
      ) : null}
    </main>
  );
}

/** "Couldn't load fleets." with Try again, inside the table's card (Fleets · error). */
function FleetsError({ retryHref }: { retryHref: string }) {
  return (
    <div className="ob-error-row" role="alert">
      <IconAlert width={16} height={16} />
      <b style={{ flex: 1 }}>{OBA.errT}</b>
      <a className="btn ghost" href={retryHref}>
        <IconRotate />
        {OBA.tryAgain}
      </a>
    </div>
  );
}
