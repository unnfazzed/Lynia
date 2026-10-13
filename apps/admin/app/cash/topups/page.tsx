import { adminFetchResult } from "../../lib/api";
import type { AdminTopupRow, AdminTopupsPage, TopupFilter } from "../../lib/adminTypes";
import { DataTable, type Column } from "../../components/DataTable";
import { FilterNav } from "../../components/FilterNav";
import { Pill, type PillKind } from "../../components/StatusPill";
import { RecordLink } from "../../components/links";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../../components/states";
import { IconBanknote } from "../../components/icons";
import { fmtDateTime, money, timeAgo } from "../../lib/format";
import { ANOMALY_LABEL, declineLabel, railLabel } from "../../lib/money-labels";
import { CashNav } from "../CashNav";
import { TopupActions } from "./TopupActions";

/**
 * Admin console v2 §6 — Top-ups (undrawn; route (b), built from the admin kit's primitives). Every top-up
 * intent, Paynow and manual, newest first, 50 a page. The short-paid and paid-on-declined chips are the ops
 * queue: Paynow said money moved but the wallet didn't credit it. Re-poll, Credit what was paid and Mark
 * resolved are reason-coded and audited by the API.
 */
const FILTERS: Array<{ value: "" | TopupFilter; label: string }> = [
  { value: "", label: "all" },
  { value: "pending", label: "pending" },
  { value: "confirmed", label: "confirmed" },
  { value: "declined", label: "declined" },
  { value: "expired", label: "expired" },
  { value: "short_paid", label: "short-paid" },
  { value: "paid_on_declined", label: "paid on declined" },
];

const STATUS_KIND: Record<AdminTopupRow["status"], PillKind> = {
  pending: "mut",
  confirmed: "good",
  declined: "bad",
  expired: "mut",
};

function pageParam(v: string | string[] | undefined): number {
  const n = typeof v === "string" ? Number.parseInt(v, 10) : Number.NaN;
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export default async function TopupsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const active = typeof sp.filter === "string" && FILTERS.some((f) => f.value === sp.filter) ? (sp.filter as TopupFilter) : "";
  const page = pageParam(sp.page);
  const qs = (filter: string, p: number) => {
    const q = [filter && `filter=${filter}`, p > 1 && `page=${p}`].filter(Boolean).join("&");
    return q ? `?${q}` : "";
  };
  const res = await adminFetchResult<AdminTopupsPage>(`/admin/cash/topups${qs(active, page)}`);
  const data = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = data !== null;

  const columns: Column<AdminTopupRow>[] = [
    { key: "biker", header: "Biker", cell: (t) => <RecordLink href={`/riders/${t.riderId}`}>{t.riderName}</RecordLink> },
    { key: "amount", header: "Amount", className: "num", cell: (t) => money(t.amount) },
    { key: "fee", header: "Fee", className: "num mut", cell: (t) => (t.fee ? money(t.fee) : "—") },
    { key: "charged", header: "Charged", className: "num", cell: (t) => (t.charged ? money(t.charged) : "—") },
    { key: "rail", header: "Rail", cell: (t) => railLabel(t.rail) },
    { key: "ref", header: "Paynow ref", className: "mono", cell: (t) => t.providerRef ?? "—" },
    {
      key: "status",
      header: "Status",
      cell: (t) => (
        <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
          <Pill kind={STATUS_KIND[t.status] ?? "mut"}>{t.status}</Pill>
          {t.anomaly ? <Pill kind={t.anomaly.resolved || t.status === "confirmed" ? "mut" : "bad"}>{ANOMALY_LABEL[t.anomaly.kind]}</Pill> : null}
        </span>
      ),
    },
    {
      key: "why",
      header: "Decline reason",
      className: "mut",
      cell: (t) =>
        t.anomaly && t.anomaly.paid != null && !t.anomaly.resolved && t.status !== "confirmed"
          ? `Paynow says ${money(t.anomaly.paid)} paid`
          : declineLabel(t.declineReason),
    },
    { key: "age", header: "Age", className: "mut num", cell: (t) => <span title={fmtDateTime(t.initiatedAt)}>{timeAgo(t.initiatedAt)}</span> },
    { key: "actions", header: "", cell: (t) => <TopupActions row={t} connected={connected} /> },
  ];

  const counted = FILTERS.map((f) => ({
    value: f.value,
    label: f.value && data ? `${f.label} · ${data.counts[f.value]}` : f.label,
  }));

  return (
    <main className="content">
      <header className="page">
        <h1>Top-ups</h1>
        <span className="sub">Every Paynow top-up and manual credit</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <CashNav active="/cash/topups" />
      <FilterNav items={counted} active={active} hrefFor={(v) => `/cash/topups${qs(v, 1)}`} />

      <section className="card">
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(t) => t.id}
          empty={
            connected ? (
              <EmptyState icon={<IconBanknote />} title="No top-ups here" line={active ? "Nothing matches this filter." : "Top-ups show here once bikers start paying in."} />
            ) : (
              <EmptyState icon={<IconBanknote />} title={reasonTitle(reason ?? "unconfigured", "Top-ups")} line={reasonLine(reason ?? "unconfigured", "top-ups")} />
            )
          }
        />
        {data && (data.hasMore || page > 1) ? (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
            <span>Page {page}</span>
            {page > 1 ? (
              <a href={`/cash/topups${qs(active, page - 1)}`} style={{ color: "var(--accent-text)", textDecoration: "none" }}>
                ← Previous
              </a>
            ) : null}
            {data.hasMore ? (
              <a href={`/cash/topups${qs(active, page + 1)}`} style={{ color: "var(--accent-text)", textDecoration: "none" }}>
                Next →
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
