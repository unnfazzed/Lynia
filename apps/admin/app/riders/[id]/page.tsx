import { formatPhoneLocal, tokens } from "@lynia/shared";
import { adminFetch, adminFetchResult } from "../../lib/api";
import type { RiderDetail, RiderReferralSummary, TripRow, WalletView, WalletLedgerEntry } from "../../lib/adminTypes";
import { DataTable, type Column } from "../../components/DataTable";
import { KpiCard } from "../../components/KpiCard";
import { KeyValue } from "../../components/KeyValue";
import { StatusPill, Pill } from "../../components/StatusPill";
import { RiderActions } from "./RiderActions";
import { PlateConfirmButton } from "../PlateConfirm";
import { WalletCreditButton, WalletReverseButton } from "./WalletActions";
import { railLabel } from "../../lib/money-labels";
import { OrderLink } from "../../components/links";
import { enumLabel, fmtDateTime, money } from "../../lib/format";
import { ReportsCallout } from "../../components/ReportsCallout";
import { AuditCard, fetchAuditFor } from "../../components/AuditSection";
import { fetchTimeline, TimelineCard } from "../../components/Timeline";
import { CreateReferralLinkButton } from "../../referrals/ReferralActions";
import { Conn, EmptyState, OfflineBanner, reasonLine, reasonTitle, SubsectionUnavailable } from "../../components/states";
import { IconAlert, IconBike } from "../../components/icons";
import { PhoneReveal } from "../../components/PhoneReveal";
import { canRevealPhones } from "../../actions/phone";

/** Humanize a commission-ledger entry type for the wallet ledger table. */
const LEDGER_TYPE_LABEL: Record<WalletLedgerEntry["type"], string> = {
  ride_commission: "Ride commission",
  topup: "Top-up",
  grace: "Starting credit",
  adjustment: "Adjustment",
  reversal: "Reversal",
  free_job: "Free job",
};

/** Admin console v2 §6: what one statement row was — the top-up's rail, Paynow ref and fee; a commission's rate
 *  and basis; a free job; a reversal of an earlier credit. "—" on an older API that sends none of it. */
function ledgerDetail(l: WalletLedgerEntry): string {
  const parts: Array<string | null> = [];
  if (l.type === "free_job") parts.push(l.ratePct && l.fare ? `Free job · ${Number(l.ratePct)}% of ${money(l.fare)} waived` : "Free job");
  else if ((l.type === "ride_commission" || l.type === "adjustment") && l.ratePct && l.fare) parts.push(`${Number(l.ratePct)}% of ${money(l.fare)}`);
  else if (l.topUp) {
    if (l.topUp.manual) parts.push("Manual credit");
    else parts.push(railLabel(l.topUp.rail), l.topUp.ref, l.topUp.fee ? `fee ${money(l.topUp.fee)}` : null);
  } else if (l.type === "reversal" && l.reversesId) parts.push("Reverses an earlier credit");
  if (l.reversed) parts.push(`${money(l.reversed)} reversed`);
  const out = parts.filter(Boolean).join(" · ");
  return out || "—";
}

/** Rider profile (kit `riders.html` detail): trips, rating, completion, cancel strikes, cooldown,
 *  cash owed, recent trips; suspend / lift / ban actions each reason-coded through <ConfirmModal>. */
function ratingTxt(r: RiderDetail): string {
  return r.rating ? `★ ${r.rating} · ${r.ratingCount}` : "★ new";
}

function riderPill(r: RiderDetail) {
  if (r.status === "online") return <Pill kind="good" dot>online</Pill>;
  if (r.status === "suspended") return <Pill kind="bad">suspended</Pill>;
  if (r.status === "banned") return <Pill kind="bad">banned</Pill>;
  if (r.status === "on_hold") return <Pill kind="bad">on hold</Pill>;
  if (r.status === "cooldown") return <Pill>cooldown · {r.cooldown}</Pill>;
  return <Pill kind="mut">offline</Pill>;
}

export default async function RiderProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const rawWalletCursor = sp.walletCursor;
  const walletCursor = typeof rawWalletCursor === "string" ? rawWalletCursor : undefined;
  const tlCursor = typeof sp.tlCursor === "string" ? sp.tlCursor : undefined;
  const res = await adminFetchResult<RiderDetail>(`/admin/riders/${id}`);

  if (!("data" in res)) {
    const reason = res.reason;
    return (
      <main className="content">
        <header className="page">
          <a className="back" href="/riders">
            ← Bikers
          </a>
          <h1 style={{ fontSize: 18 }}>Biker profile</h1>
          <Conn connected={false} reason={reason} />
        </header>
        <OfflineBanner reason={reason} />
        <section className="card">
          <EmptyState
            icon={<IconBike />}
            title={reasonTitle(reason, "Profile")}
            line={reasonLine(reason, "this biker")}
          />
        </section>
      </main>
    );
  }

  const r = res.data;
  // Past the guard `r` is live data → connected; suspend/lift/ban actions are enabled.
  const connected = true;
  // DOC-16-03: the prepaid-wallet view (balance + a ledger page). Best-effort — null if the endpoint is
  // absent (older API) or unreachable, in which case the wallet card degrades to a "not available" note.
  // LC-D07: `walletCursor` pages further back past the first 20 entries via the "Load older" link below.
  // Admin console v2 §4 / §8: the timeline and the audit rows load alongside it, each best-effort the same way.
  // D-112: the biker's referral link and how their referrals are doing, best-effort the same way.
  const [wallet, timeline, audit, referral, revealAllowed] = await Promise.all([
    adminFetch<WalletView>(`/admin/riders/${id}/wallet${walletCursor ? `?cursor=${encodeURIComponent(walletCursor)}` : ""}`),
    fetchTimeline(`/admin/people/${id}/timeline?as=rider`, tlCursor),
    fetchAuditFor(id),
    adminFetch<RiderReferralSummary>(`/admin/riders/${id}/referral`),
    canRevealPhones(),
  ]);

  // `commission_freeze` state (design OV-4A). `undefined` today for EVERY rider — no admin read surface
  // reports `Rider.heldReason`, so this is "unknown", never "not frozen" (see `WalletView.frozen`).
  // The frozen branches below are the kit's specified states, ready for the day the API serves the field.
  const walletFrozen = wallet?.frozen;

  // Admin console v2 §6: the biker statement — each row says what it was (order, top-up rail + fee,
  // commission rate + basis, free job) and who wrote it.
  const summary = wallet?.summary;
  const ledgerCols: Column<WalletLedgerEntry>[] = [
    { key: "at", header: "When", className: "mut", cell: (l) => fmtDateTime(l.at) },
    { key: "type", header: "Type", cell: (l) => LEDGER_TYPE_LABEL[l.type] ?? enumLabel(l.type) },
    { key: "order", header: "Order", cell: (l) => (l.orderId ? <OrderLink id={l.orderId} /> : "—") },
    { key: "detail", header: "Detail", className: "mut", cell: ledgerDetail },
    {
      key: "amount",
      header: "Amount",
      className: "num",
      cell: (l) => {
        const v = Number(l.amount);
        return <span style={{ color: v < 0 ? tokens.color.danger : tokens.color.accentText, fontWeight: 600 }}>{v < 0 ? money(v) : `+${money(v)}`}</span>;
      },
    },
    { key: "balanceAfter", header: "Balance", className: "num", cell: (l) => money(l.balanceAfter) },
    { key: "by", header: "By", className: "mut", cell: (l) => l.actorName ?? l.actor ?? "—" },
    { key: "note", header: "Note", className: "mut", cell: (l) => l.note ?? "—" },
    {
      key: "reverse",
      header: "",
      cell: (l) =>
        // Only a credit can be reversed, and only while the statement (and so `reversed`) is served.
        summary && Number(l.amount) > 0 && l.type !== "reversal" ? (
          <WalletReverseButton
            id={r.id}
            name={r.name}
            connected={connected}
            entry={{ id: l.id, amount: l.amount, reversed: l.reversed ?? null, label: LEDGER_TYPE_LABEL[l.type] ?? enumLabel(l.type) }}
          />
        ) : null,
    },
  ];

  const tripCols: Column<TripRow>[] = [
    { key: "id", header: "Order", cell: (t) => <OrderLink id={t.id} /> },
    { key: "route", header: "Route", cell: (t) => t.route },
    { key: "status", header: "Status", cell: (t) => <StatusPill status={t.status} /> },
    { key: "fare", header: "Fare", className: "num", cell: (t) => money(t.fare) },
    { key: "when", header: "When", className: "mut", cell: (t) => t.when },
  ];

  const suspended = r.status === "suspended";
  const banned = r.status === "banned";
  const onHold = r.status === "on_hold";
  // A suspend/ban only blocks going online going forward — it doesn't touch an order this rider is
  // already mid-delivery on, and the customer isn't told their rider's standing changed. Ops needs
  // this flagged so they can decide (via the trip row below) whether to step in on that live order.
  const hasOrphanedActiveOrder = (suspended || banned) && r.activeOrders > 0;

  return (
    <main className="content">
      <header className="page">
        <a className="back" href="/riders">
          ← Bikers
        </a>
        <h1 style={{ fontSize: 18 }}>{r.name}</h1>
        <span style={{ display: "flex", gap: 6 }}>
          {riderPill(r)}
          <Pill kind={r.kyc === "verified" ? "good" : "mut"}>{enumLabel(r.kyc)}</Pill>
        </span>
        <Conn connected={connected} />
      </header>

      {suspended ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Suspended.</b> {r.suspendReason ? `Reason: ${r.suspendReason}. ` : ""}The biker cannot go online until
            the suspension is lifted.
          </span>
        </div>
      ) : null}

      {banned ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Permanently banned.</b> {r.suspendReason ? `Reason: ${r.suspendReason}. ` : ""}This account is blocked
            and can&apos;t be reinstated from the console.
          </span>
        </div>
      ) : null}

      {onHold ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>On hold.</b> Reliability score {r.reliabilityScore}. Use &ldquo;Clear hold&rdquo; below to lift it.
          </span>
        </div>
      ) : null}

      {hasOrphanedActiveOrder ? (
        <div className="warnbar">
          <IconAlert />
          <span className="t">
            <b>Still on a live delivery.</b> This biker has {r.activeOrders} order{r.activeOrders > 1 ? "s" : ""} in
            progress — {suspended ? "suspending" : "banning"} them does not cancel or reassign it. Check the trip
            below and cancel it from the order page if it shouldn&apos;t continue.
          </span>
        </div>
      ) : null}

      <ReportsCallout reports={r.reportLog} subject="rider" />

      <section className="panels" style={{ marginBottom: tokens.space.lg }}>
        <KpiCard label="Trips" value={r.trips} hint={`since ${r.joined}`} size={22} />
        <KpiCard label="Rating" value={ratingTxt(r)} hint={r.ratingCount ? `${r.ratingCount} ratings` : "no ratings yet"} size={22} />
        <KpiCard label="Completion" value={r.completion} hint="accepted → delivered" size={22} />
        <KpiCard
          label="Cancel strikes"
          value={r.strikes}
          hint={r.status === "cooldown" ? `cooldown ${r.cooldown}` : "cancels on record"}
          size={22}
        />
        {/* Commission/balance is shown once, authoritatively, in the Prepaid-wallet card below — not
            repeated as a KPI + a Details row (which read as three different figures for one number). */}
      </section>

      {/* DOC-16-03: prepaid commission wallet — balance, the manual-credit rail, and the ledger. */}
      <section className="card" style={{ marginBottom: tokens.space.lg }}>
        <div className="block-title">
          Prepaid wallet ·{" "}
          <a href="/cash" style={{ color: tokens.color.accentText, fontWeight: 400, fontSize: 12, textDecoration: "none" }}>
            commission overview →
          </a>
          <span className="right">
            balance{" "}
            <b style={{ color: wallet && Number(wallet.balance) < 0 ? tokens.color.danger : tokens.color.ink }}>
              {wallet ? money(wallet.balance) : "—"}
            </b>
            {walletFrozen ? (
              <>
                {" · "}
                <Pill kind="bad">{enumLabel("commission_freeze")}</Pill>
              </>
            ) : null}
          </span>
        </div>
        {!wallet && <SubsectionUnavailable noun="wallet view" />}

        {summary ? (
          <section className="panels" style={{ marginBottom: tokens.space.md }}>
            <KpiCard
              label="Balance"
              value={<span style={{ color: Number(wallet!.balance) < 0 ? tokens.color.danger : undefined }}>{money(wallet!.balance)}</span>}
              hint={Number(wallet!.balance) < 0 ? "owed" : "prepaid"}
              size={22}
            />
            <KpiCard label="Free jobs left" value={summary.freeJobsLeft} hint={`${summary.tripsCount} jobs done`} size={22} />
            <KpiCard
              label="Commission to come"
              value={money(summary.pendingCommission)}
              hint={
                summary.commissionActive
                  ? `${summary.pendingJobs} delivered, not closed yet`
                  : `commission is ${summary.ratePct}%`
              }
              size={22}
            />
            <KpiCard
              label="Last top-up"
              value={summary.lastTopup ? money(summary.lastTopup.amount) : "—"}
              hint={summary.lastTopup ? `${railLabel(summary.lastTopup.rail)} · ${fmtDateTime(summary.lastTopup.at)}` : "never"}
              size={22}
            />
          </section>
        ) : null}

        {/* Kit riders.html:70 — the frozen-wallet warnbar. */}
        {walletFrozen ? (
          <div className="warnbar">
            <IconAlert />
            <span className="t">
              <b>Wallet frozen.</b> Only an admin can clear it.
            </span>
          </div>
        ) : null}

        {/* Kit riders.html:256-257 — while frozen, the credit form is replaced by a disabled empty state
            rather than left clickable. */}
        {walletFrozen ? (
          <div style={{ marginBottom: tokens.space.md }}>
            <EmptyState
              icon={<IconAlert />}
              title="Credits are disabled"
              line="Clear the wallet freeze before crediting."
            />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: tokens.space.md, flexWrap: "wrap" }}>
            {/* Only offer a credit once the balance loaded — crediting blind (wallet view failed) would let
                ops act without seeing the current balance. */}
            <WalletCreditButton id={r.id} name={r.name} connected={connected && wallet !== null} />
            {summary ? <WalletReverseButton id={r.id} name={r.name} connected={connected} /> : null}
            {wallet && (
              <span style={{ fontSize: 12, color: tokens.color.muted }}>
                Each credit is reason-coded and lands on the ledger below.
              </span>
            )}
          </div>
        )}

        <DataTable
          columns={ledgerCols}
          rows={wallet?.ledger ?? []}
          rowKey={(l) => l.id}
          empty={
            <div className="mut" style={{ textAlign: "center", padding: 20 }}>
              {wallet ? "No wallet activity yet — no top-ups or ride commission recorded." : "Wallet view unavailable."}
            </div>
          }
        />
        {/* LC-D07: the ledger is paged server-side (20/page) — disclose it and link further back instead
            of silently truncating. `walletCursor` clears to reset to the newest page. */}
        {wallet && (wallet.nextCursor || walletCursor) ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: tokens.color.muted, marginTop: 12 }}>
            <span>Showing 20 entries per page.</span>
            <span style={{ display: "flex", gap: 12 }}>
              {walletCursor ? (
                <a href={`/riders/${id}`} style={{ color: tokens.color.accentText }}>
                  ↺ Back to latest
                </a>
              ) : null}
              {wallet.nextCursor ? (
                <a href={`/riders/${id}?walletCursor=${encodeURIComponent(wallet.nextCursor)}`} style={{ color: tokens.color.accentText }}>
                  Load older →
                </a>
              ) : null}
            </span>
          </div>
        ) : null}
      </section>

      <div className="detail-grid">
        <section className="card">
          <div className="block-title">Recent trips</div>
          <DataTable
            columns={tripCols}
            rows={r.trail}
            rowKey={(t) => t.id}
            getRowHref={(t) => `/orders/${t.id}`}
            empty={
              <div className="mut" style={{ textAlign: "center", padding: 20 }}>
                No trips yet — this biker hasn&apos;t gone online.
              </div>
            }
          />
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: tokens.space.lg }}>
          <section className="card">
            <div className="block-title">Details</div>
            <KeyValue
              rows={[
                {
                  label: "Phone",
                  // A-03: masked unless the biker is on a live order; the owner can reveal it (owner 2026-10-18).
                  value: r.phone.includes("•") ? (
                    <PhoneReveal profileId={r.id} masked={r.phone} allowed={revealAllowed} connected={connected} />
                  ) : (
                    <span className="mono">{formatPhoneLocal(r.phone)}</span>
                  ),
                },
                {
                  label: "Bike reg",
                  value: (
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <span className="mono">{r.bike || "—"}</span>
                      {/* First Run v2 E4 (D-82): ops' check of the plate. */}
                      {r.bike && r.plateStatus === "checking" ? <Pill kind="mut">checking</Pill> : null}
                      {r.bike && r.plateStatus === "verified" ? <Pill kind="good">verified</Pill> : null}
                    </span>
                  ),
                },
                { label: "Joined", value: r.joined },
                {
                  label: "KYC",
                  value: (
                    <span>
                      {enumLabel(r.kyc)} ·{" "}
                      <a href="/riders?kyc=pending" style={{ color: tokens.color.accentText }}>
                        {r.kyc === "verified" ? "view queue" : "in queue"}
                      </a>
                    </span>
                  ),
                },
                // Commission/balance intentionally lives only in the Prepaid-wallet card below.
              ]}
            />
          </section>

          <section className="card">
            <div className="block-title">Actions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <RiderActions
                id={r.id}
                name={r.name}
                suspended={suspended}
                banned={banned}
                onHold={onHold}
                suspendSummary={`${r.trips} trips · ${ratingTxt(r)}`}
                phone={r.phone}
                revealAllowed={revealAllowed}
                connected={connected}
              />
              {r.bike && r.plateStatus === "checking" ? (
                <PlateConfirmButton id={r.id} name={r.name} plate={r.bike} connected={connected} path={`/riders/${r.id}`} />
              ) : null}
            </div>
            <div style={{ fontSize: 11, color: tokens.color.muted, marginTop: 10 }}>
              Suspensions and bans require a reason code and are recorded in the audit log.
            </div>
          </section>

          {/* D-112: the biker's personal link to share, and the friends who joined through it. */}
          <section className="card">
            <div className="block-title">Referrals</div>
            {!referral ? (
              <SubsectionUnavailable noun="referral link" />
            ) : referral.link ? (
              <KeyValue
                rows={[
                  { label: "Link", value: <span className="mono" style={{ userSelect: "all", wordBreak: "break-all" }}>{referral.link}</span> },
                  {
                    label: "Friends",
                    value: (
                      <span>
                        {referral.referred} joined · {referral.verified} verified · {referral.paidCount} paid ·{" "}
                        <a href={`/referrals?referrer=${r.id}`} style={{ color: tokens.color.accentText }}>
                          view
                        </a>
                      </span>
                    ),
                  },
                ]}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="mut" style={{ fontSize: 12 }}>
                  No link yet. Create one, then send it to the biker to share with friends.
                </div>
                <CreateReferralLinkButton id={r.id} name={r.name} connected={connected} />
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Admin console v2 §4 / §8: everything that happened to this biker, then the ops actions on them. */}
      <TimelineCard
        page={timeline}
        cursor={tlCursor}
        pageHref={(c) => `/riders/${id}?tlCursor=${encodeURIComponent(c)}`}
        resetHref={`/riders/${id}`}
      />
      <AuditCard target={id} list={audit} />
    </main>
  );
}
