import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import type { AdminReferralRow, AdminReferrals, AdminReferrerRow } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { Pill } from "../components/StatusPill";
import { RecordLink } from "../components/links";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { IconUserPlus } from "../components/icons";
import { fmtDate, fmtDateTime, money, timeAgo } from "../lib/format";
import { FLAG_LABEL, STAGE_KIND, STAGE_LABEL, stageText } from "./labels";
import { MarkPaidButton } from "./ReferralActions";

/**
 * Biker referrals (owner 2026-10-18, ledger D-112; undrawn, route (b) like D-106): who brought in which new
 * bikers, how far each friend got (joined → verified → riding), the warnings to check, and the cash ops paid.
 * A biker's link is created on their biker page. Nothing here pays in the app: ops pay in cash and record it.
 */
const LINK = { color: "var(--accent-text)", textDecoration: "none" } as const;

export default async function ReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const referrerFilter = typeof sp.referrer === "string" ? sp.referrer : "";
  const res = await adminFetchResult<AdminReferrals>("/admin/referrals");
  const data = "data" in res ? res.data : null;
  const reason = "data" in res ? undefined : res.reason;
  const connected = data !== null;
  const t = data?.totals;
  const rows = (data?.rows ?? []).filter((r) => !referrerFilter || r.referrer.id === referrerFilter);
  const filteredName = referrerFilter ? data?.referrers.find((r) => r.id === referrerFilter)?.name : undefined;

  const referrerCols: Column<AdminReferrerRow>[] = [
    { key: "biker", header: "Biker", cell: (r) => <RecordLink href={`/riders/${r.id}`}>{r.name}</RecordLink> },
    { key: "code", header: "Code", className: "mono", cell: (r) => r.code },
    { key: "referred", header: "Joined", className: "num", cell: (r) => r.referred },
    { key: "verified", header: "Verified", className: "num", cell: (r) => r.verified },
    { key: "riding", header: "Riding", className: "num", cell: (r) => r.riding },
    {
      key: "unpaid",
      header: "Verified, not paid",
      className: "num",
      cell: (r) => (r.unpaidVerified ? <b>{r.unpaidVerified}</b> : <span className="mut">0</span>),
    },
    { key: "paid", header: "Paid", className: "num", cell: (r) => (r.paidCount ? `${r.paidCount} · ${money(r.paidTotal)}` : "—") },
    {
      key: "list",
      header: "",
      cell: (r) => (
        <a href={`/referrals?referrer=${r.id}`} style={LINK}>
          Friends →
        </a>
      ),
    },
  ];

  const rowCols: Column<AdminReferralRow>[] = [
    { key: "friend", header: "New biker", cell: (r) => <RecordLink href={`/riders/${r.friend.id}`}>{r.friend.name}</RecordLink> },
    { key: "referrer", header: "Brought in by", cell: (r) => <RecordLink href={`/riders/${r.referrer.id}`}>{r.referrer.name}</RecordLink> },
    { key: "joined", header: "Joined", className: "mut", cell: (r) => <span title={fmtDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span> },
    {
      key: "stage",
      header: "Stage",
      cell: (r) => (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Pill kind={STAGE_KIND[r.stage]}>{STAGE_LABEL[r.stage]}</Pill>
          <span className="mut">{stageText(r)}</span>
        </span>
      ),
    },
    { key: "verifiedAt", header: "Verified", className: "mut", cell: (r) => (r.friend.verifiedAt ? fmtDate(r.friend.verifiedAt) : "—") },
    {
      key: "flags",
      header: "Check",
      cell: (r) =>
        r.flags.length ? (
          <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {r.flags.map((f) => (
              <Pill key={f} kind="warn">
                {FLAG_LABEL[f]}
              </Pill>
            ))}
          </span>
        ) : (
          <span className="mut">—</span>
        ),
    },
    {
      key: "paid",
      header: "Paid",
      cell: (r) => (r.paid ? <span title={fmtDateTime(r.paid.at)}>{`${money(r.paid.amount)} · ${fmtDate(r.paid.at)}`}</span> : <MarkPaidButton row={r} connected={connected} />),
    },
  ];

  const empty = (noun: string, line: string) =>
    connected ? (
      <EmptyState icon={<IconUserPlus />} title={`No ${noun} yet`} line={line} />
    ) : (
      <EmptyState icon={<IconUserPlus />} title={reasonTitle(reason ?? "unconfigured", "Referrals")} line={reasonLine(reason ?? "unconfigured", "referrals")} />
    );

  return (
    <main className="content">
      <header className="page">
        <h1>Referrals</h1>
        <span className="sub">Bikers who brought in new bikers</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Joined" value={t ? t.referred : "—"} hint={t ? `from ${t.links} ${t.links === 1 ? "link" : "links"}` : undefined} />
        <KpiCard label="Verified" value={t ? t.verified : "—"} hint="passed the ID check" />
        <KpiCard label="Riding" value={t ? t.riding : "—"} hint="verified and did a job" />
        <KpiCard label="Verified, not paid" value={t ? t.unpaidVerified : "—"} hint="what you may owe" />
        <KpiCard label="Paid" value={t ? money(t.paidTotal) : "—"} hint={t ? `${t.paidCount} ${t.paidCount === 1 ? "referral" : "referrals"}` : undefined} />
      </section>

      <section className="card" style={{ marginBottom: tokens.space.lg }}>
        <div className="block-title">
          By biker
          <span className="right">
            <a href="/referrals/referrals.csv" style={LINK}>
              Download CSV
            </a>
          </span>
        </div>
        <DataTable
          columns={referrerCols}
          rows={data?.referrers ?? []}
          rowKey={(r) => r.id}
          empty={empty("referrals", "Create a biker's link on their biker page, then send it to them to share.")}
        />
      </section>

      <section className="card">
        <div className="block-title">
          {filteredName ? `${filteredName}'s friends` : "Every referral"}
          {referrerFilter ? (
            <span className="right">
              <a href="/referrals" style={LINK}>
                Show all
              </a>
            </span>
          ) : null}
        </div>
        <DataTable columns={rowCols} rows={rows} rowKey={(r) => r.id} empty={empty("referrals", "New bikers who installed from a biker's link show here.")} />
        {data?.capped ? (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>Showing the newest {data.rows.length} referrals.</div>
        ) : null}
      </section>
    </main>
  );
}
