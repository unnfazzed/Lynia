import { tokens } from "@lynia/shared";
import { adminFetchResult } from "../lib/api";
import type { FunnelKind, FunnelRange, FunnelView, StuckList, StuckRow, StuckSummary } from "../lib/adminTypes";
import { DataTable, type Column } from "../components/DataTable";
import { FilterNav } from "../components/FilterNav";
import { FunnelStrip } from "../components/FunnelStrip";
import { RecordLink } from "../components/links";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle } from "../components/states";
import { IconCheck, IconUser } from "../components/icons";
import { fmtDateTime, timeAgo, whatsappHref } from "../lib/format";
import { NudgeButton } from "./NudgeButton";

/**
 * Admin console v2 §4 — People (undrawn; route (b), D-106, built from the admin kit's primitives). One page per
 * side (bikers, customers, merchants): the happy-path funnel for the people who signed up in the range, each
 * tile linking to the stuck list of those who didn't reach it, and the stuck lists themselves, oldest first,
 * with Call, WhatsApp and Nudge (a push, owner decision 6).
 */

const KINDS: Array<{ value: FunnelKind; label: string; noun: string }> = [
  { value: "biker", label: "bikers", noun: "Bikers" },
  { value: "customer", label: "customers", noun: "Customers" },
  { value: "merchant", label: "merchants", noun: "Businesses" },
];

const RANGES: Array<{ value: FunnelRange; label: string; phrase: string }> = [
  { value: "today", label: "today", phrase: "today" },
  { value: "7d", label: "7 days", phrase: "in the last 7 days" },
  { value: "30d", label: "30 days", phrase: "in the last 30 days" },
];

const pick = <T extends string>(v: string | string[] | undefined, allowed: readonly T[], dflt: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : dflt;

function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const kind = pick(sp.kind, KINDS.map((k) => k.value), "biker");
  const range = pick(sp.range, RANGES.map((r) => r.value), "7d");
  const kindMeta = KINDS.find((k) => k.value === kind)!;
  const rangeMeta = RANGES.find((r) => r.value === range)!;

  const [funnelRes, summaryRes] = await Promise.all([
    adminFetchResult<FunnelView>(`/admin/funnels?kind=${kind}&range=${range}`),
    adminFetchResult<StuckSummary>(`/admin/stuck?kind=${kind}`),
  ]);
  const funnel = "data" in funnelRes ? funnelRes.data : null;
  const summary = "data" in summaryRes ? summaryRes.data : null;
  const lists = summary?.lists ?? [];
  const listKey = typeof sp.list === "string" && lists.some((l) => l.key === sp.list) ? sp.list : (lists[0]?.key ?? null);
  const listRes = listKey ? await adminFetchResult<StuckList>(`/admin/stuck?list=${listKey}`) : null;
  const list = listRes && "data" in listRes ? listRes.data : null;

  const reason = "data" in funnelRes ? ("data" in summaryRes ? undefined : summaryRes.reason) : funnelRes.reason;
  const connected = funnel !== null || summary !== null;
  const qs = (o: { kind?: string; range?: string; list?: string | null }) => {
    const q = new URLSearchParams({ kind: o.kind ?? kind, range: o.range ?? range });
    if (o.list) q.set("list", o.list);
    return `/people?${q.toString()}`;
  };

  const columns: Column<StuckRow>[] = [
    { key: "name", header: kind === "merchant" ? "Business" : "Name", cell: (r) => <RecordLink href={r.href}>{r.name}</RecordLink> },
    {
      key: "waiting",
      header: "Waiting",
      className: "mut num",
      cell: (r) => <span title={fmtDateTime(r.since)}>{timeAgo(r.since)}</span>,
    },
    {
      key: "detail",
      header: "Detail",
      cell: (r) => (
        <span>
          {r.detail ?? "—"}
          {r.link ? (
            <>
              {" · "}
              <RecordLink href={r.link.href}>{r.link.label}</RecordLink>
            </>
          ) : null}
        </span>
      ),
    },
    {
      key: "nudged",
      header: "Last nudge",
      className: "mut",
      cell: (r) => (r.lastNudgeAt ? <span title={fmtDateTime(r.lastNudgeAt)}>{timeAgo(r.lastNudgeAt)}</span> : "never"),
    },
    {
      key: "contact",
      header: "",
      cell: (r) => {
        const wa = whatsappHref(r.phone);
        return (
          <span className="contact-actions">
            {r.phone ? (
              <a className="btn quiet" href={telHref(r.phone)}>
                Call
              </a>
            ) : null}
            {wa ? (
              <a className="btn quiet" href={wa} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            ) : null}
            {list?.nudge && r.profileId ? (
              <NudgeButton
                profileId={r.profileId}
                name={r.name}
                step={list.key}
                copy={list.copy}
                hasPush={r.hasPush}
                nudgedToday={r.nudgedToday}
                connected={connected}
              />
            ) : null}
          </span>
        );
      },
    },
  ];

  return (
    <main className="content">
      <header className="page">
        <h1>People</h1>
        <span className="sub">Who is on the happy path, who fell off, and how to reach them</span>
        <Conn connected={connected} reason={reason} />
      </header>

      {!connected ? <OfflineBanner reason={reason} /> : null}

      <FilterNav items={KINDS} active={kind} hrefFor={(v) => qs({ kind: v, list: null })} />
      <FilterNav items={RANGES} active={range} hrefFor={(v) => qs({ range: v, list: listKey })} />

      <section className="card" style={{ marginBottom: tokens.space.lg }}>
        <div className="block-title">
          {kindMeta.noun} who signed up {rangeMeta.phrase}
          <span className="right">
            {funnel ? `${funnel.cohort}${funnel.truncated ? "+ (newest only)" : ""} signed up` : "—"}
          </span>
        </div>
        {funnel ? (
          funnel.cohort > 0 ? (
            <FunnelStrip kind={kind} range={range} steps={funnel.steps} label={`${kindMeta.noun} funnel`} />
          ) : (
            <EmptyState icon={<IconUser />} title="Nobody signed up in this range" line="Try 7 or 30 days." />
          )
        ) : (
          <EmptyState icon={<IconUser />} title={reasonTitle(reason ?? "unconfigured", "Funnel")} line={reasonLine(reason ?? "unconfigured", "the funnel")} />
        )}
        {funnel && funnel.cohort > 0 ? (
          <p className="mut" style={{ fontSize: 12, margin: `${tokens.space.md}px 0 0` }}>
            Each tile: how many reached the step, the share from the step before, and the median time it took. Tap a tile for who is stuck
            before it.
          </p>
        ) : null}
      </section>

      <section className="card" id="stuck">
        <div className="block-title">Stuck</div>
        {lists.length > 0 ? (
          <FilterNav
            items={lists.map((l) => ({ value: l.key, label: `${l.title} · ${l.capped ? `${l.count}+` : l.count}` }))}
            active={listKey ?? ""}
            hrefFor={(v) => `${qs({ list: v })}#stuck`}
          />
        ) : null}
        {list ? (
          <>
            <p className="mut" style={{ fontSize: 13, margin: `0 0 ${tokens.space.md}px` }}>
              {list.line}
              {list.note ? ` ${list.note}` : ""}
              {list.capped ? ` Showing the oldest ${list.rows.length}.` : ""}
            </p>
            {list.queue ? (
              <p style={{ fontSize: 13, margin: 0 }}>
                <b>{list.queue.count}</b> waiting over 24 hours.{" "}
                <a className="btn ghost" href={list.queue.href}>
                  {list.queue.label}
                </a>
              </p>
            ) : (
              <div className="stuck-table">
                <DataTable
                  columns={columns}
                  rows={list.rows}
                  rowKey={(r) => r.id}
                  empty={<EmptyState icon={<IconCheck />} title="Nobody is stuck here" line="This list is empty right now." />}
                />
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={<IconUser />}
            title={reasonTitle(reason ?? "unconfigured", "Stuck lists")}
            line={reasonLine(reason ?? "unconfigured", "the stuck lists")}
          />
        )}
      </section>
    </main>
  );
}
